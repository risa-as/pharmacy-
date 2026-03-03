import { machineIdSync } from 'node-machine-id';
import os from 'os';

/**
 * Returns a unique, hardware-bound identity for the current device.
 * It uses node-machine-id to get a consistent hash of the machine's GUID (Windows)
 * or IOPlatformUUID (macOS) which survives OS reinstalls and network adapter changes.
 */
export function getDeviceIdentity() {
    try {
        const hardwareId = machineIdSync();
        const deviceName = os.hostname();

        return {
            hardwareId,
            deviceName,
            success: true,
        };
    } catch (error) {
        console.error("Failed to get hardware device identity:", error);
        return {
            hardwareId: null,
            deviceName: os.hostname(),
            success: false,
            error
        };
    }
}
