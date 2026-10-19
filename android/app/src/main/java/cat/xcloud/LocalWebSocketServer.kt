package cat.xcloud

import java.io.BufferedInputStream
import java.io.IOException
import java.io.OutputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.security.MessageDigest
import java.util.Base64
import java.util.concurrent.CopyOnWriteArraySet

/**
 * Servidor WebSocket mínim (RFC 6455) que només escolta a 127.0.0.1 i només accepta connexions
 * amb l'origen indicat (la pàgina xbox.com dins del WebView). Així cap altra app o pàgina pot connectar-s'hi.
 */
class LocalWebSocketServer(
    private val allowedOrigin: String,
    private val onClientConnected: (LocalWebSocketServer.Client) -> Unit,
) {
    private var server: ServerSocket? = null
    private val clients = CopyOnWriteArraySet<Client>()

    @Volatile
    var port: Int = 0
        private set

    @Synchronized
    fun start(preferredPort: Int): Int {
        if (server != null) return port

        val loopback = InetAddress.getByName("127.0.0.1")
        val socket = try {
            ServerSocket(preferredPort, 4, loopback)
        } catch (e: IOException) {
            ServerSocket(0, 4, loopback)
        }

        server = socket
        port = socket.localPort

        Thread({
            while (!socket.isClosed) {
                try {
                    val client = socket.accept()
                    Thread({ handle(client) }, "ws-client").apply { isDaemon = true }.start()
                } catch (e: IOException) {
                    break
                }
            }
        }, "ws-accept").apply { isDaemon = true }.start()

        return port
    }

    fun broadcast(data: ByteArray) {
        clients.forEach { it.sendBinary(data) }
    }

    @Synchronized
    fun stop() {
        clients.forEach { it.close() }
        clients.clear()
        try { server?.close() } catch (e: IOException) {}
        server = null
        port = 0
    }

    private fun handle(socket: Socket) {
        val client = Client(socket)
        try {
            socket.tcpNoDelay = true
            val input = BufferedInputStream(socket.getInputStream())
            if (!handshake(input, socket.getOutputStream())) {
                socket.close()
                return
            }

            clients.add(client)
            onClientConnected(client)
            readLoop(input, client)
        } catch (e: Exception) {
            // connexió tancada
        } finally {
            clients.remove(client)
            client.close()
        }
    }

    private fun readLine(input: BufferedInputStream): String? {
        val sb = StringBuilder()
        while (true) {
            val b = input.read()
            if (b == -1) return null
            if (b == '\n'.code) return sb.toString().trimEnd('\r')
            sb.append(b.toChar())
            if (sb.length > 8192) return null // capçalera massa llarga
        }
    }

    private fun handshake(input: BufferedInputStream, out: OutputStream): Boolean {
        val requestLine = readLine(input) ?: return false
        if (!requestLine.startsWith("GET ")) return false

        val headers = HashMap<String, String>()
        while (true) {
            val line = readLine(input) ?: return false
            if (line.isEmpty()) break
            val idx = line.indexOf(':')
            if (idx > 0) headers[line.substring(0, idx).trim().lowercase()] = line.substring(idx + 1).trim()
        }

        val key = headers["sec-websocket-key"]
        val isUpgrade = headers["upgrade"]?.equals("websocket", ignoreCase = true) == true
        if (!isUpgrade || key == null || headers["origin"] != allowedOrigin) {
            out.write("HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".toByteArray())
            out.flush()
            return false
        }

        val accept = Base64.getEncoder().encodeToString(
            MessageDigest.getInstance("SHA-1").digest((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").toByteArray())
        )
        out.write(
            ("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
                "Sec-WebSocket-Accept: $accept\r\n\r\n").toByteArray()
        )
        out.flush()
        return true
    }

    private fun readFully(input: BufferedInputStream, buf: ByteArray, len: Int) {
        var read = 0
        while (read < len) {
            val n = input.read(buf, read, len - read)
            if (n == -1) throw IOException("EOF")
            read += n
        }
    }

    /** Llegeix fotogrames del client; només cal atendre tancament i ping. */
    private fun readLoop(input: BufferedInputStream, client: Client) {
        val header = ByteArray(2)
        while (true) {
            readFully(input, header, 2)
            val opcode = header[0].toInt() and 0x0F
            val masked = (header[1].toInt() and 0x80) != 0
            var length = (header[1].toInt() and 0x7F).toLong()

            if (length == 126L) {
                val ext = ByteArray(2); readFully(input, ext, 2)
                length = (((ext[0].toInt() and 0xFF) shl 8) or (ext[1].toInt() and 0xFF)).toLong()
            } else if (length == 127L) {
                val ext = ByteArray(8); readFully(input, ext, 8)
                length = ext.fold(0L) { acc, b -> (acc shl 8) or (b.toLong() and 0xFF) }
            }

            if (length > 65536) throw IOException("Fotograma massa gran")

            val mask = ByteArray(4)
            if (masked) readFully(input, mask, 4)

            val payload = ByteArray(length.toInt())
            readFully(input, payload, payload.size)
            if (masked) for (i in payload.indices) payload[i] = (payload[i].toInt() xor mask[i % 4].toInt()).toByte()

            when (opcode) {
                0x8 -> return                      // tancament
                0x9 -> client.send(0xA, payload)   // ping -> pong
            }
        }
    }

    class Client(private val socket: Socket) {
        fun sendBinary(data: ByteArray) = send(0x2, data)

        @Synchronized
        fun send(opcode: Int, data: ByteArray) {
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
                close()
            }
        }

        fun close() {
            try { socket.close() } catch (e: IOException) {}
        }
    }
}
