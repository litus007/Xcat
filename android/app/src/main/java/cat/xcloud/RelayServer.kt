package cat.xcloud

import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.Inet4Address
import java.net.InetSocketAddress
import java.net.NetworkInterface
import java.net.ServerSocket
import java.net.Socket
import java.net.SocketAddress
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/**
 * Relé de xarxa local (versió Android). Fa el mateix que `relay/relay.mjs` del PC i parla el mateix protocol
 * (vegeu relay/PROTOCOL.md):
 *  - serveix la pàgina d'espectador a http://<IP-del-mòbil>:<port>
 *  - fa de senyalització WebRTC entre l'amfitrió (la pàgina d'xCloud dins del WebView) i els espectadors
 *  - reenvia els mandos dels espectadors a l'amfitrió
 *  - respon a les sol·licituds de detecció UDP perquè altres dispositius el trobin sols
 *
 * Seguretat: l'amfitrió només es pot connectar des del mateix dispositiu i amb origen xbox.com; els espectadors
 * entren amb PIN (amb bloqueig per força bruta) o amb l'aprovació de qui té la pantalla davant.
 */
class RelayServer(
    private val deviceName: String,
    private val viewerHtml: () -> ByteArray,
    private val maxViewers: Int = 3,
) {
    companion object {
        const val DISCOVERY_PORT = 8788
        private const val GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
        private const val HOST_ORIGIN = "https://www.xbox.com"
        private const val APP_VIEWER_ORIGIN = "https://appassets.androidplatform.net"
        private const val INPUT_FRAME_SIZE = 26
        private const val MAX_PAYLOAD = 64 * 1024
        private const val MAX_FAILURES = 5
        private const val LOCK_MS = 60_000L
        private const val IDLE_TIMEOUT_MS = 30_000L           // amfitrió
        private const val VIEWER_IDLE_TIMEOUT_MS = 15_000L    // espectadors: envien dades cada ~250 ms
        private const val SWEEP_MS = 5_000L
        private const val JOIN_TIMEOUT_MS = 5_000L
        private const val APPROVAL_TIMEOUT_MS = 30_000L
        private const val MAX_PENDING_PER_IP = 2
        private const val MAX_PENDING = 5
        private val MDNS = Regex("\\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.local\\b", RegexOption.IGNORE_CASE)
    }

    private class Failure(var count: Int = 0, var until: Long = 0)

    private inner class Client(val socket: Socket, val role: String) {
        @Volatile var id = 0
        @Volatile var vsid = 0
        @Volatile var joined = false
        @Volatile var requesting = false
        @Volatile var name = ""
        @Volatile var deviceId = ""
        @Volatile var lastSeen = System.currentTimeMillis()
        @Volatile var closed = false
        @Volatile var joinTimeout: ScheduledFuture<*>? = null
        val ip: String = stripV6(socket.inetAddress?.hostAddress ?: "")
        val localIp: String = stripV6(socket.localAddress?.hostAddress ?: "")

        @Synchronized
        fun write(opcode: Int, data: ByteArray) {
            if (closed) return
            try {
                val out = socket.getOutputStream()
                out.write(0x80 or opcode)
                when {
                    data.size < 126 -> out.write(data.size)
                    data.size < 65536 -> { out.write(126); out.write(data.size shr 8); out.write(data.size and 0xFF) }
                    else -> throw IOException("Missatge massa gran")
                }
                out.write(data)
                out.flush()
            } catch (e: IOException) {
                // No es crida a close(): intentaria tornar a escriure i faria recursió
                closed = true
                try { socket.close() } catch (ignored: IOException) {}
            }
        }

        fun sendText(obj: JSONObject) = write(0x1, obj.toString().toByteArray(Charsets.UTF_8))
        fun sendBinary(data: ByteArray) = write(0x2, data)

        fun close(code: Int = 1000) {
            if (closed) return
            write(0x8, byteArrayOf((code shr 8).toByte(), (code and 0xFF).toByte()))
            closed = true
            try { socket.close() } catch (e: IOException) {}
        }
    }

    private inner class Pending(val client: Client, val msg: JSONObject) {
        @Volatile var timeout: ScheduledFuture<*>? = null
    }

    private var server: ServerSocket? = null
    private var udp: DatagramSocket? = null
    private var scheduler: ScheduledExecutorService? = null

    @Volatile private var host: Client? = null
    private val viewers = ConcurrentHashMap<Int, Client>()
    private val pending = ConcurrentHashMap<Int, Pending>()
    private val failures = ConcurrentHashMap<String, Failure>()
    private val random = SecureRandom()
    private val joinCounter = AtomicInteger(0)
    private val requestCounter = AtomicInteger(0)

    @Volatile var pin: String = ""
        private set
    @Volatile var port: Int = 0
        private set

    // ---------------------------------------------------------------- Cicle de vida

    @Synchronized
    fun start(preferredPort: Int): Int {
        if (server != null) return port

        pin = "%06d".format(random.nextInt(1_000_000))
        val socket = try {
            ServerSocket(preferredPort, 16)
        } catch (e: IOException) {
            ServerSocket(0, 16)
        }
        server = socket
        port = socket.localPort

        val exec = Executors.newSingleThreadScheduledExecutor { r -> Thread(r, "relay-scheduler").apply { isDaemon = true } }
        scheduler = exec

        Thread({
            while (!socket.isClosed) {
                try {
                    val client = socket.accept()
                    Thread({ handle(client) }, "relay-conn").apply { isDaemon = true }.start()
                } catch (e: IOException) {
                    break
                }
            }
        }, "relay-accept").apply { isDaemon = true }.start()

        // Cada SWEEP_MS: tanca les connexions mortes i envia un ping a les vives (el navegador respon amb un pong)
        exec.scheduleAtFixedRate({
            val now = System.currentTimeMillis()
            (listOfNotNull(host) + viewers.values).forEach {
                val limit = if (it.role == "host") IDLE_TIMEOUT_MS else VIEWER_IDLE_TIMEOUT_MS
                if (now - it.lastSeen > limit) it.close(1001) else it.write(0x9, ByteArray(0))
            }
        }, SWEEP_MS, SWEEP_MS, TimeUnit.MILLISECONDS)

        startDiscovery()
        return port
    }

    @Synchronized
    fun stop() {
        (listOfNotNull(host) + viewers.values).forEach { it.close(1001) }
        viewers.clear()
        pending.clear()
        host = null
        try { udp?.close() } catch (e: Exception) {}
        udp = null
        try { server?.close() } catch (e: IOException) {}
        server = null
        scheduler?.shutdownNow()
        scheduler = null
        port = 0
    }

    fun lanUrls(): List<String> {
        val urls = ArrayList<String>()
        try {
            for (nic in NetworkInterface.getNetworkInterfaces()) {
                if (!nic.isUp || nic.isLoopback) continue
                for (addr in nic.inetAddresses) {
                    if (addr is Inet4Address && !addr.isLoopbackAddress) urls.add("http://${addr.hostAddress}:$port")
                }
            }
        } catch (e: Exception) {}
        return urls
    }

    // ---------------------------------------------------------------- Detecció a la xarxa (UDP)

    private fun startDiscovery() {
        try {
            val sock = DatagramSocket(null as SocketAddress?).apply {
                reuseAddress = true
                bind(InetSocketAddress(DISCOVERY_PORT))
            }
            udp = sock
            Thread({
                val buf = ByteArray(256)
                while (!sock.isClosed) {
                    try {
                        val packet = DatagramPacket(buf, buf.size)
                        sock.receive(packet)
                        val text = String(packet.data, 0, packet.length, Charsets.UTF_8)
                        if (text.startsWith("XCC-DISCOVER")) {
                            val reply = JSONObject().put("app", "xcloud-catala").put("v", 1).put("name", deviceName)
                                .put("port", port).put("hostOnline", host != null).toString().toByteArray()
                            sock.send(DatagramPacket(reply, reply.size, packet.address, packet.port))
                        }
                    } catch (e: IOException) {
                        if (sock.isClosed) break
                    }
                }
            }, "relay-discovery").apply { isDaemon = true }.start()
        } catch (e: Exception) {
            udp = null // sense detecció automàtica: es pot entrar escrivint l'adreça
        }
    }

    // ---------------------------------------------------------------- HTTP / WebSocket

    private fun stripV6(ip: String) = ip.replace(Regex("^::ffff:", RegexOption.IGNORE_CASE), "").substringBefore('%')

    private fun isLoopback(ip: String) = ip == "127.0.0.1" || ip == "::1" || ip == "0:0:0:0:0:0:0:1"

    private fun readLine(input: BufferedInputStream): String? {
        val sb = StringBuilder()
        while (true) {
            val b = input.read()
            if (b == -1) return null
            if (b == '\n'.code) return sb.toString().trimEnd('\r')
            sb.append(b.toChar())
            if (sb.length > 8192) return null
        }
    }

    private fun respond(socket: Socket, status: String, contentType: String?, body: ByteArray) {
        val out = socket.getOutputStream()
        val head = StringBuilder("HTTP/1.1 $status\r\nContent-Length: ${body.size}\r\nConnection: close\r\n")
        head.append("Cache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nX-Frame-Options: DENY\r\n")
        if (contentType != null) head.append("Content-Type: $contentType\r\n")
        if (contentType?.startsWith("text/html") == true) {
            head.append("Content-Security-Policy: default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; ")
            head.append("connect-src ws: wss:; media-src blob: mediastream:; img-src data:\r\n")
        }
        head.append("\r\n")
        out.write(head.toString().toByteArray())
        out.write(body)
        out.flush()
    }

    private fun handle(socket: Socket) {
        var client: Client? = null
        try {
            socket.tcpNoDelay = true
            socket.soTimeout = (JOIN_TIMEOUT_MS * 2).toInt()
            val input = BufferedInputStream(socket.getInputStream())

            val requestLine = readLine(input) ?: return
            val parts = requestLine.split(" ")
            if (parts.size < 3 || parts[0] != "GET") { respond(socket, "400 Bad Request", null, ByteArray(0)); return }

            val headers = HashMap<String, String>()
            while (true) {
                val line = readLine(input) ?: return
                if (line.isEmpty()) break
                val idx = line.indexOf(':')
                if (idx > 0) headers[line.substring(0, idx).trim().lowercase()] = line.substring(idx + 1).trim()
            }

            val target = parts[1]
            val path = target.substringBefore('?')
            val query = target.substringAfter('?', "")

            if (headers["upgrade"]?.equals("websocket", ignoreCase = true) != true) {
                when (path) {
                    "/", "/index.html" -> respond(socket, "200 OK", "text/html; charset=utf-8", viewerHtml())
                    "/health" -> respond(socket, "200 OK", "text/plain", "ok".toByteArray())
                    else -> respond(socket, "404 Not Found", null, ByteArray(0))
                }
                return
            }

            // ---- Pas a WebSocket
            val key = headers["sec-websocket-key"]
            val role = query.split("&").firstOrNull { it.startsWith("role=") }?.substringAfter("role=")
            if (path != "/ws" || key == null || (role != "host" && role != "viewer")) {
                respond(socket, "400 Bad Request", null, ByteArray(0)); return
            }

            val origin = headers["origin"]
            if (role == "host") {
                if (!isLoopback(socket.inetAddress.hostAddress ?: "") || origin != HOST_ORIGIN) {
                    respond(socket, "403 Forbidden", null, ByteArray(0)); return
                }
            } else {
                val originHost = try { java.net.URI(origin ?: "").authority } catch (e: Exception) { null }
                val sameOrigin = originHost != null && originHost == headers["host"]
                if (!sameOrigin && origin != APP_VIEWER_ORIGIN) {
                    respond(socket, "403 Forbidden", null, ByteArray(0)); return
                }
            }

            val accept = Base64.getEncoder().encodeToString(
                MessageDigest.getInstance("SHA-1").digest((key + GUID).toByteArray())
            )
            socket.getOutputStream().write(
                ("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
                    "Sec-WebSocket-Accept: $accept\r\n\r\n").toByteArray()
            )
            socket.getOutputStream().flush()
            socket.soTimeout = 0

            client = Client(socket, role)
            if (role == "host") onHostConnected(client) else onViewerConnected(client)
            readLoop(input, client)
        } catch (e: Exception) {
            // connexió tancada o error de protocol
        } finally {
            client?.let { if (it.role == "host") onHostGone(it) else onViewerGone(it) }
            try { socket.close() } catch (e: IOException) {}
        }
    }

    private fun readFully(input: BufferedInputStream, buf: ByteArray, len: Int) {
        var read = 0
        while (read < len) {
            val n = input.read(buf, read, len - read)
            if (n == -1) throw IOException("EOF")
            read += n
        }
    }

    private fun readLoop(input: BufferedInputStream, client: Client) {
        val header = ByteArray(2)
        var fragments = ByteArrayOutputStream()
        var fragOpcode = 0

        while (true) {
            readFully(input, header, 2)
            val fin = (header[0].toInt() and 0x80) != 0
            val opcode = header[0].toInt() and 0x0F
            val masked = (header[1].toInt() and 0x80) != 0
            var length = (header[1].toInt() and 0x7F).toLong()

            if ((header[0].toInt() and 0x70) != 0 || !masked) throw IOException("protocol")

            if (length == 126L) {
                val ext = ByteArray(2); readFully(input, ext, 2)
                length = (((ext[0].toInt() and 0xFF) shl 8) or (ext[1].toInt() and 0xFF)).toLong()
            } else if (length == 127L) {
                val ext = ByteArray(8); readFully(input, ext, 8)
                length = ext.fold(0L) { acc, b -> (acc shl 8) or (b.toLong() and 0xFF) }
            }
            if (length > MAX_PAYLOAD || (opcode >= 8 && (!fin || length > 125))) throw IOException("protocol")

            val mask = ByteArray(4); readFully(input, mask, 4)
            val payload = ByteArray(length.toInt()); readFully(input, payload, payload.size)
            for (i in payload.indices) payload[i] = (payload[i].toInt() xor mask[i % 4].toInt()).toByte()
            client.lastSeen = System.currentTimeMillis()

            when (opcode) {
                0x8 -> return
                0x9 -> { client.write(0xA, payload); continue }
                0xA -> continue
            }

            // Text/binari amb possible fragmentació
            if (opcode != 0) {
                if (fragments.size() > 0) throw IOException("protocol")
                fragOpcode = opcode
            } else if (fragments.size() == 0) {
                throw IOException("protocol")
            }
            fragments.write(payload)
            if (fragments.size() > MAX_PAYLOAD) throw IOException("massa gran")
            if (!fin) continue

            val full = fragments.toByteArray()
            val fullOpcode = fragOpcode
            fragments = ByteArrayOutputStream()

            if (fullOpcode == 0x1) {
                val msg = try { JSONObject(String(full, Charsets.UTF_8)) } catch (e: Exception) { continue }
                if (client.role == "host") onHostMessage(msg) else onViewerMessage(client, msg)
            } else if (fullOpcode == 0x2 && client.role == "viewer") {
                onViewerInput(client, full)
            }
        }
    }

    // ---------------------------------------------------------------- Host

    private fun viewerJson(v: Client) = JSONObject().put("id", v.id).put("name", v.name).put("vsid", v.vsid)

    private fun hello(): JSONObject {
        val list = JSONArray()
        viewers.values.filter { it.joined }.forEach { list.put(viewerJson(it)) }
        return JSONObject().put("type", "hello").put("name", deviceName).put("pin", pin).put("urls", JSONArray(lanUrls()))
            .put("maxViewers", maxViewers).put("viewers", list)
    }

    private fun onHostConnected(client: Client) {
        host?.close(4000) // només un host alhora
        host = client
        client.sendText(hello())
        viewers.values.filter { it.joined }.forEach {
            client.sendText(viewerJson(it).put("type", "viewer-joined"))
            it.sendText(JSONObject().put("type", "host-online"))
        }
    }

    private fun onHostGone(client: Client) {
        if (host !== client) return
        host = null
        viewers.values.filter { it.joined }.forEach { it.sendText(JSONObject().put("type", "host-offline")) }
    }

    private fun onHostMessage(msg: JSONObject) {
        when (msg.optString("type")) {
            "signal" -> {
                val v = viewers[msg.optInt("to")]
                if (v != null && v.joined) {
                    v.sendText(JSONObject().put("type", "signal").put("data", rewriteMdns(msg.opt("data"), v.localIp, "")))
                }
            }
            "approve", "deny" -> {
                val entry = pending.remove(msg.optInt("rid")) ?: return
                entry.timeout?.cancel(false)
                if (msg.optString("type") == "approve") {
                    admit(entry.client, entry.msg)
                } else {
                    entry.client.sendText(JSONObject().put("type", "error").put("reason", "denied"))
                    entry.client.close(4006)
                }
            }
            "kick" -> viewers[msg.optInt("id")]?.let {
                it.sendText(JSONObject().put("type", "error").put("reason", "kicked"))
                it.close(4003)
            }
        }
    }

    /** Substitueix els noms mDNS dels candidats ICE (només a "sdp" i "candidate") per l'IP real. */
    private fun rewriteMdns(value: Any?, ip: String, key: String): Any? = when (value) {
        is String -> if (key == "sdp" || key == "candidate") MDNS.replace(value, ip) else value
        is JSONObject -> JSONObject().also { out -> value.keys().forEach { k -> out.put(k, rewriteMdns(value.opt(k), ip, k)) } }
        is JSONArray -> JSONArray().also { out -> for (i in 0 until value.length()) out.put(rewriteMdns(value.opt(i), ip, key)) }
        else -> value
    }

    // ---------------------------------------------------------------- Espectadors

    private fun isLocked(ip: String): Boolean {
        val f = failures[ip] ?: return false
        return f.count >= MAX_FAILURES && System.currentTimeMillis() < f.until
    }

    private fun onViewerConnected(client: Client) {
        client.joinTimeout = scheduler?.schedule({ if (!client.joined && !client.requesting) client.close(4002) },
            JOIN_TIMEOUT_MS, TimeUnit.MILLISECONDS)
    }

    /** Un dispositiu només pot tenir una sessió: si torna a entrar, la sessió antiga (potser morta) se substitueix. */
    private fun replaceDuplicates(client: Client, deviceId: String) {
        if (deviceId.isEmpty()) return
        viewers.values.filter { it !== client && it.joined && it.deviceId == deviceId }.forEach { old ->
            viewers.remove(old.id)
            old.joined = false // així onViewerGone no avisa dues vegades
            host?.sendText(JSONObject().put("type", "viewer-left").put("id", old.id)) // l'amfitrió neteja connexió i mando virtual
            old.sendText(JSONObject().put("type", "error").put("reason", "replaced"))
            old.close(4009)
        }
    }

    /** Assigna identificador a l'espectador i l'incorpora a la sessió. */
    private fun admit(client: Client, msg: JSONObject) {
        if (client.joined || client.closed) return

        client.deviceId = msg.optString("deviceId", "").take(64)
        replaceDuplicates(client, client.deviceId)

        var id = 0
        synchronized(viewers) {
            for (i in 1..maxViewers) if (!viewers.containsKey(i)) { id = i; break }
            if (id != 0) {
                client.id = id
                client.vsid = joinCounter.incrementAndGet()
                client.joined = true
                client.name = msg.optString("name", "").take(24)
                viewers[id] = client
            }
        }

        if (id == 0) {
            client.sendText(JSONObject().put("type", "error").put("reason", "full")); client.close(4004); return
        }

        client.joinTimeout?.cancel(false)
        client.sendText(JSONObject().put("type", "joined").put("id", id).put("hostOnline", host != null))
        host?.sendText(viewerJson(client).put("type", "viewer-joined"))
    }

    private fun removePending(client: Client) {
        pending.entries.removeIf { (_, entry) ->
            val mine = entry.client === client
            if (mine) entry.timeout?.cancel(false)
            mine
        }
    }

    private fun onViewerMessage(client: Client, msg: JSONObject) {
        when (msg.optString("type")) {
            "join" -> {
                if (client.joined || client.requesting) return

                val supplied = msg.optString("pin", "")
                if (!msg.has("pin") || supplied.isEmpty()) {
                    requestApproval(client, msg); return
                }

                if (isLocked(client.ip)) {
                    client.sendText(JSONObject().put("type", "error").put("reason", "locked")); client.close(4001); return
                }

                if (!MessageDigest.isEqual(supplied.toByteArray(), pin.toByteArray())) {
                    val f = failures.getOrPut(client.ip) { Failure() }
                    f.count++
                    f.until = System.currentTimeMillis() + LOCK_MS
                    client.sendText(JSONObject().put("type", "error").put("reason", "pin")); client.close(4001); return
                }

                failures.remove(client.ip)
                admit(client, msg)
            }
            "signal" -> if (client.joined) {
                host?.sendText(JSONObject().put("type", "signal").put("from", client.id)
                    .put("data", rewriteMdns(msg.opt("data"), client.ip, "")))
            }
        }
    }

    /** Sense PIN: qui té la pantalla davant (l'amfitrió) ha d'aprovar l'espectador. */
    private fun requestApproval(client: Client, msg: JSONObject) {
        val h = host
        if (h == null) {
            client.sendText(JSONObject().put("type", "error").put("reason", "no-host")); client.close(4007); return
        }

        val mine = pending.values.count { it.client.ip == client.ip }
        if (mine >= MAX_PENDING_PER_IP || pending.size >= MAX_PENDING) {
            client.sendText(JSONObject().put("type", "error").put("reason", "busy")); client.close(4008); return
        }

        val rid = requestCounter.incrementAndGet()
        client.requesting = true
        client.joinTimeout?.cancel(false)

        val entry = Pending(client, msg)
        pending[rid] = entry
        entry.timeout = scheduler?.schedule({
            if (pending.remove(rid) != null) {
                client.sendText(JSONObject().put("type", "error").put("reason", "timeout"))
                client.close(4005)
            }
        }, APPROVAL_TIMEOUT_MS, TimeUnit.MILLISECONDS)

        h.sendText(JSONObject().put("type", "join-request").put("rid", rid)
            .put("name", msg.optString("name", "").take(24))
            .put("deviceId", msg.optString("deviceId", "").take(64))
            .put("ip", client.ip))
        client.sendText(JSONObject().put("type", "waiting"))
    }

    private fun onViewerInput(client: Client, payload: ByteArray) {
        val h = host ?: return
        if (!client.joined || payload.size != INPUT_FRAME_SIZE || payload[0].toInt() != 1) return
        val out = ByteArray(payload.size + 1)
        out[0] = client.id.toByte()
        System.arraycopy(payload, 0, out, 1, payload.size)
        h.sendBinary(out)
    }

    private fun onViewerGone(client: Client) {
        client.joinTimeout?.cancel(false)
        removePending(client)
        if (client.joined && viewers[client.id] === client) {
            viewers.remove(client.id)
            host?.sendText(JSONObject().put("type", "viewer-left").put("id", client.id))
        }
    }
}
