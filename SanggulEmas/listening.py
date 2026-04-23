import asyncio
import websockets
import json
import math
import os
import signal
import sys
from datetime import datetime

# ============================================
# Configuration
# ============================================

LORIOT_WSS_URL = "wss://ap1.loriot.io/app?token=vnoJDwAAAA1hcDEubG9yaW90LmlvqszO6Kw82E49Xjax-B37sA=="

LOG_DIR = "logs"
LOG_FILE_RAW = os.path.join(LOG_DIR, "loriot_raw_packets.txt")
LOG_FILE_DECODED = os.path.join(LOG_DIR, "loriot_decoded_data.txt")
LOG_FILE_CSV = os.path.join(LOG_DIR, "loriot_sensor_data.csv")

# Connection settings
PING_INTERVAL = 30
PING_TIMEOUT = 20
RECONNECT_MIN_DELAY = 5
RECONNECT_MAX_DELAY = 60
CONNECTION_TIMEOUT = 15

# Track stats
stats = {
    'connected_since': None,
    'total_rx': 0,
    'total_reconnects': 0,
    'last_rx_time': None
}

# ============================================
# Aircom Payload Decoder
# ============================================

def check_bit(number, bit_pos):
    return 0 if (number & (1 << bit_pos)) == 0 else 1

def int32_from_bytes(byte_list, start):
    return (byte_list[start + 3] << 24) | (byte_list[start + 2] << 16) | (byte_list[start + 1] << 8) | byte_list[start]

def float_from_bytes(byte_list, offset):
    word = (((((byte_list[offset + 3] * 256) + byte_list[offset + 2]) * 256) + byte_list[offset + 1]) * 256) + byte_list[offset]
    mantissa = word & 0x007FFFFF
    exponent = (word & 0x7F800000) >> 23
    sign = -1 if (word >> 31) else 1

    if exponent == 0x000:
        value = mantissa * math.pow(2, -23) * 2 * math.pow(2, -127) if mantissa else 0.0
    elif exponent < 0xFF:
        value = (1 + mantissa * math.pow(2, -23)) * math.pow(2, exponent - 127)
    else:
        value = float('nan') if mantissa else float('inf')

    return round(sign * value, 4)

def decode_aircom_payload(f_port, payload_bytes):
    decoded = {}

    if len(payload_bytes) == 0:
        return decoded

    header = payload_bytes[0]
    header2 = 0
    start_pos = 1

    if check_bit(header, 0) == 1:
        decoded['D1'] = check_bit(header, 1)
        decoded['D2'] = check_bit(header, 2)
        decoded['D3'] = check_bit(header, 3)
        decoded['D4'] = check_bit(header, 4)
    else:
        if check_bit(header, 7) == 1:
            header2 = payload_bytes[1]
            start_pos += 1

        if check_bit(header, 1) == 1 and (len(payload_bytes) - start_pos) >= 1:
            digitals = payload_bytes[start_pos]
            decoded['D1'] = check_bit(digitals, 0)
            decoded['D2'] = check_bit(digitals, 1)
            decoded['D3'] = check_bit(digitals, 2)
            decoded['D4'] = check_bit(digitals, 3)
            start_pos += 1

        if check_bit(header, 2) == 1 and (len(payload_bytes) - start_pos) >= 4:
            decoded['A1'] = float_from_bytes(payload_bytes, start_pos)
            start_pos += 4

        if check_bit(header, 3) == 1 and (len(payload_bytes) - start_pos) >= 4:
            decoded['A2'] = float_from_bytes(payload_bytes, start_pos)
            start_pos += 4

        if check_bit(header, 7) == 1 and check_bit(header2, 1) == 1 and (len(payload_bytes) - start_pos) >= 4:
            decoded['A3'] = float_from_bytes(payload_bytes, start_pos)
            start_pos += 4

        if check_bit(header, 7) == 1 and check_bit(header2, 2) == 1 and (len(payload_bytes) - start_pos) >= 4:
            decoded['A4'] = float_from_bytes(payload_bytes, start_pos)
            start_pos += 4

        if check_bit(header, 7) == 1 and check_bit(header2, 3) == 1 and (len(payload_bytes) - start_pos) >= 4:
            decoded['A5'] = float_from_bytes(payload_bytes, start_pos)
            start_pos += 4

        if check_bit(header, 4) == 1 and (len(payload_bytes) - start_pos) >= 4:
            decoded['CNT1'] = int32_from_bytes(payload_bytes, start_pos)
            start_pos += 4

        if check_bit(header, 5) == 1 and (len(payload_bytes) - start_pos) >= 4:
            decoded['CNT2'] = int32_from_bytes(payload_bytes, start_pos)
            start_pos += 4

        if check_bit(header, 6) == 1 and (len(payload_bytes) - start_pos) >= 6:
            decoded['VOLT'] = round((payload_bytes[start_pos] * 0.01) + 1.5, 2)
            decoded['TEMP'] = round((payload_bytes[start_pos + 1] * 0.5) - 20, 1)
            timestamp = int32_from_bytes(payload_bytes, start_pos + 2)
            decoded['TIME'] = datetime.utcfromtimestamp(timestamp).strftime('%Y-%m-%d %H:%M:%S UTC')
            start_pos += 6

    return decoded

# ============================================
# File Logger
# ============================================

def init_log_files():
    os.makedirs(LOG_DIR, exist_ok=True)

    if not os.path.exists(LOG_FILE_RAW):
        with open(LOG_FILE_RAW, 'w') as f:
            f.write("")

    if not os.path.exists(LOG_FILE_DECODED):
        with open(LOG_FILE_DECODED, 'w') as f:
            f.write("")

    if not os.path.exists(LOG_FILE_CSV):
        with open(LOG_FILE_CSV, 'w') as f:
            f.write("Timestamp,DevEUI,fPort,fCnt,Frequency,RSSI,SNR,DR,D1,D2,D3,D4,A1,A2,A3,A4,A5,CNT1,CNT2,VOLT,TEMP,DIAG_TIME,RawPayload\n")

def log_raw_packet(timestamp, message):
    with open(LOG_FILE_RAW, 'a') as f:
        f.write(f"[{timestamp}] {message}\n")

def log_decoded_data(timestamp, device_info, decoded):
    with open(LOG_FILE_DECODED, 'a') as f:
        decoded_str = json.dumps(decoded) if decoded else "(empty)"
        f.write(f"[{timestamp}] EUI={device_info['eui']} fCnt={device_info['fcnt']} RSSI={device_info['rssi']} SNR={device_info['snr']} | {decoded_str}\n")

def log_csv_data(timestamp, device_info, decoded):
    row = [
        timestamp,
        device_info.get('eui', ''),
        str(device_info.get('fport', '')),
        str(device_info.get('fcnt', '')),
        str(device_info.get('freq', '')),
        str(device_info.get('rssi', '')),
        str(device_info.get('snr', '')),
        str(device_info.get('dr', '')),
        str(decoded.get('D1', '')),
        str(decoded.get('D2', '')),
        str(decoded.get('D3', '')),
        str(decoded.get('D4', '')),
        str(decoded.get('A1', '')),
        str(decoded.get('A2', '')),
        str(decoded.get('A3', '')),
        str(decoded.get('A4', '')),
        str(decoded.get('A5', '')),
        str(decoded.get('CNT1', '')),
        str(decoded.get('CNT2', '')),
        str(decoded.get('VOLT', '')),
        str(decoded.get('TEMP', '')),
        str(decoded.get('TIME', '')),
        device_info.get('raw_data', '')
    ]
    with open(LOG_FILE_CSV, 'a') as f:
        f.write(','.join(row) + '\n')

def log_event(message):
    """Log connection events to decoded log file for audit trail."""
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    with open(LOG_FILE_DECODED, 'a') as f:
        f.write(f"[{timestamp}] SYSTEM | {message}\n")

# ============================================
# WebSocket Listener
# ============================================

def now():
    return datetime.now().strftime('%Y-%m-%d %H:%M:%S')

def process_message(message):
    try:
        data = json.loads(message)
        cmd = data.get("cmd", "unknown")
        timestamp = now()

        if cmd == "rx":
            eui = data.get("EUI", "N/A")
            f_port = data.get("port", 0)
            fcnt = data.get("fcnt", "N/A")
            freq = data.get("freq", "N/A")
            rssi = data.get("rssi", "N/A")
            snr = data.get("snr", "N/A")
            dr = data.get("dr", "N/A")
            raw_data = data.get("data", "")

            device_info = {
                'eui': eui, 'fport': f_port, 'fcnt': fcnt,
                'freq': freq, 'rssi': rssi, 'snr': snr,
                'dr': dr, 'raw_data': raw_data
            }

            decoded = {}
            if raw_data:
                payload_bytes = bytes.fromhex(raw_data)
                decoded = decode_aircom_payload(f_port, list(payload_bytes))

            decoded_str = json.dumps(decoded) if decoded else "(empty)"
            print(f"[{timestamp}] RX | EUI={eui} fCnt={fcnt} RSSI={rssi} SNR={snr} DR={dr} | {decoded_str}")

            log_raw_packet(timestamp, message)
            log_decoded_data(timestamp, device_info, decoded)
            log_csv_data(timestamp, device_info, decoded)

            stats['total_rx'] += 1
            stats['last_rx_time'] = timestamp

        elif cmd == "gw":
            print(f"[{timestamp}] GW | {data.get('EUI', 'N/A')} status update")

    except Exception as e:
        print(f"[{now()}] ERROR | {e}")

async def listen():
    init_log_files()
    print(f"LORIOT Listener | Logs: {os.path.abspath(LOG_DIR)}")
    print(f"Connecting...\n")

    retry_delay = RECONNECT_MIN_DELAY

    while True:
        try:
            async with asyncio.timeout(CONNECTION_TIMEOUT):
                ws = await websockets.connect(
                    LORIOT_WSS_URL,
                    ping_interval=PING_INTERVAL,
                    ping_timeout=PING_TIMEOUT,
                    close_timeout=10
                )

            stats['connected_since'] = now()
            stats['total_reconnects'] += 1 if stats['total_reconnects'] > 0 or stats['total_rx'] > 0 else 0
            retry_delay = RECONNECT_MIN_DELAY

            conn_msg = f"Connected (session #{stats['total_reconnects'] + 1})"
            print(f"[{now()}] {conn_msg} — Listening... (Ctrl+C to stop)")
            log_event(conn_msg)

            try:
                async for message in ws:
                    process_message(message)
            except websockets.exceptions.ConnectionClosedError as e:
                disc_msg = f"Connection closed by server: code={e.code} reason={e.reason}"
                print(f"[{now()}] DISC | {disc_msg}")
                log_event(disc_msg)
            except websockets.exceptions.ConnectionClosedOK:
                disc_msg = "Connection closed normally"
                print(f"[{now()}] DISC | {disc_msg}")
                log_event(disc_msg)

        except asyncio.TimeoutError:
            print(f"[{now()}] TIMEOUT | Could not connect within {CONNECTION_TIMEOUT}s")
            log_event(f"Connection timeout after {CONNECTION_TIMEOUT}s")

        except OSError as e:
            print(f"[{now()}] NET ERROR | {e}")
            log_event(f"Network error: {e}")

        except Exception as e:
            print(f"[{now()}] ERROR | {e}")
            log_event(f"Error: {e}")

        # Reconnect with backoff
        stats['total_reconnects'] += 1
        recon_msg = f"Reconnecting in {retry_delay}s... (attempt #{stats['total_reconnects']}, total RX: {stats['total_rx']})"
        print(f"[{now()}] {recon_msg}")
        log_event(recon_msg)

        await asyncio.sleep(retry_delay)
        retry_delay = min(retry_delay * 2, RECONNECT_MAX_DELAY)

# ============================================
# Main
# ============================================

def shutdown():
    print(f"\n[{now()}] Shutting down... (RX total: {stats['total_rx']}, reconnects: {stats['total_reconnects']})")
    log_event(f"Shutdown. Total RX: {stats['total_rx']}, reconnects: {stats['total_reconnects']}")

if __name__ == "__main__":
    try:
        asyncio.run(listen())
    except KeyboardInterrupt:
        shutdown()
