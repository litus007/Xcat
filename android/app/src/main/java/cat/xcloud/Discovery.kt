package cat.xcloud

import org.json.JSONObject
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.NetworkInterface
import java.net.SocketTimeoutException

/**
 * Cerca partides compartides a la xarxa local: envia un paquet UDP de difusió i recull les respostes
 * dels relés (PC o app d'Android) que hi hagi escoltant.
 */
object Discovery {
    const val PORT = 8788

    data class Host(val name: String, val ip: String, val port: Int, val hostOnline: Boolean)

    /** Bloqueja uns segons: cal cridar-ho des d'un fil secundari. */
    fun scan(timeoutMs: Long = 2000): List<Host> {
        val found = LinkedHashMap<String, Host>()
        val socket = DatagramSocket().apply {
            broadcast = true
            soTimeout = 250
        }

        try {
            val payload = "XCC-DISCOVER".toByteArray()
            val targets = broadcastAddresses()
            val end = System.currentTimeMillis() + timeoutMs
            var nextSend = 0L
            val buf = ByteArray(512)

            while (System.currentTimeMillis() < end) {
                val now = System.currentTimeMillis()
                if (now >= nextSend) {
                    // UDP no és fiable: es repeteix la sol·licitud cada 600 ms
                    targets.forEach {
                        try { socket.send(DatagramPacket(payload, payload.size, it, PORT)) } catch (e: Exception) {}
                    }
                    nextSend = now + 600
                }

                try {
                    val packet = DatagramPacket(buf, buf.size)
                    socket.receive(packet)
                    val json = JSONObject(String(packet.data, 0, packet.length, Charsets.UTF_8))
                    if (json.optString("app") != "xcloud-catala") continue

                    val ip = packet.address.hostAddress ?: continue
                    found[ip] = Host(json.optString("name", ip).take(32), ip, json.optInt("port", 8787), json.optBoolean("hostOnline"))
                } catch (e: SocketTimeoutException) {
                    // continua esperant
                } catch (e: Exception) {
                    // resposta no vàlida: s'ignora
                }
            }
        } finally {
            socket.close()
        }

        return found.values.toList()
    }

    private fun broadcastAddresses(): List<InetAddress> {
        val list = ArrayList<InetAddress>()
        try { list.add(InetAddress.getByName("255.255.255.255")) } catch (e: Exception) {}
        try {
            for (nic in NetworkInterface.getNetworkInterfaces()) {
                if (!nic.isUp || nic.isLoopback) continue
                nic.interfaceAddresses.forEach { ia -> ia.broadcast?.let { list.add(it) } }
            }
        } catch (e: Exception) {}
        return list
    }
}
