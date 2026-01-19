"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.USyncDeviceProtocol = void 0;
const WABinary_1 = require("../../WABinary");
class USyncDeviceProtocol {
    constructor() {
        this.name = 'devices';
    }
    getQueryElement() {
        return {
            tag: 'devices',
            attrs: {
                version: '2',
            },
        };
    }
    getUserElement(user) {
        // Check if device information is available
        if (!user.devices || !Array.isArray(user.devices) || user.devices.length === 0) {
            return null; // Return null if no device info available
        }
        
        const deviceAttrs = {};
        
        // Add device phashing if available
        if (user.devicePhash) {
            deviceAttrs.phash = user.devicePhash;
        }
        
        // Add timestamp if available
        if (user.timestamp) {
            deviceAttrs.ts = user.timestamp.toString();
        }
        
        // Add expected timestamp if available
        if (user.expectedTimestamp) {
            deviceAttrs.expected_ts = user.expectedTimestamp.toString();
        }
        
        // If no device attributes are present, return null
        if (Object.keys(deviceAttrs).length === 0) {
            return null;
        }
        
        return {
            tag: 'devices',
            attrs: deviceAttrs,
            content: user.devices.map(device => ({
                tag: 'device',
                attrs: {
                    id: device.id?.toString() || '0',
                    'key-index': device.keyIndex?.toString() || '0',
                    'is_hosted': device.isHosted ? 'true' : 'false'
                }
            }))
        };
    }
    parser(node) {
        const deviceList = [];
        let keyIndex = undefined;
        let devicePhash = undefined;
        let timestamp = undefined;
        let expectedTimestamp = undefined;
        
        if (node.tag === 'devices') {
            (0, WABinary_1.assertNodeErrorFree)(node);
            
            // Extract device-level attributes
            if (node.attrs) {
                devicePhash = node.attrs.phash;
                timestamp = node.attrs.ts ? +node.attrs.ts : undefined;
                expectedTimestamp = node.attrs.expected_ts ? +node.attrs.expected_ts : undefined;
            }
            
            const deviceListNode = (0, WABinary_1.getBinaryNodeChild)(node, 'device-list');
            const keyIndexNode = (0, WABinary_1.getBinaryNodeChild)(node, 'key-index-list');
            
            if (Array.isArray(deviceListNode === null || deviceListNode === void 0 ? void 0 : deviceListNode.content)) {
                for (const { tag, attrs } of deviceListNode.content) {
                    const id = +attrs.id;
                    const keyIndex = +attrs['key-index'];
                    if (tag === 'device') {
                        deviceList.push({
                            id,
                            keyIndex,
                            isHosted: !!(attrs['is_hosted'] && attrs['is_hosted'] === 'true')
                        });
                    }
                }
            }
            
            if ((keyIndexNode === null || keyIndexNode === void 0 ? void 0 : keyIndexNode.tag) === 'key-index-list') {
                keyIndex = {
                    timestamp: +keyIndexNode.attrs['ts'],
                    signedKeyIndex: keyIndexNode === null || keyIndexNode === void 0 ? void 0 : keyIndexNode.content,
                    expectedTimestamp: keyIndexNode.attrs['expected_ts'] ? +keyIndexNode.attrs['expected_ts'] : undefined
                };
            }
        }
        
        return {
            deviceList,
            keyIndex,
            devicePhash,
            timestamp,
            expectedTimestamp
        };
    }
}
exports.USyncDeviceProtocol = USyncDeviceProtocol;
