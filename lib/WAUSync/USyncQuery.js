"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.USyncQuery = void 0;
const WABinary_1 = require("../WABinary");
const UsyncBotProfileProtocol_1 = require("./Protocols/UsyncBotProfileProtocol");
const UsyncLIDProtocol_1 = require("./Protocols/UsyncLIDProtocol");
const Protocols_1 = require("./Protocols");
class USyncQuery {
    constructor() {
        this.protocols = [];
        this.users = [];
        this.context = 'interactive';
        this.mode = 'query';
    }
    withMode(mode) {
        this.mode = mode;
        return this;
    }
    withContext(context) {
        this.context = context;
        return this;
    }
    withUser(user) {
        this.users.push(user);
        return this;
    }
    parseUSyncQueryResult(result) {
        if (result.attrs.type !== 'result') {
            return;
        }
        const protocolMap = Object.fromEntries(this.protocols.map((protocol) => {
            return [protocol.name, protocol.parser];
        }));
        const queryResult = {
            errors: [],
            list: [],
            sideList: [],
        };
        const usyncNode = (0, WABinary_1.getBinaryNodeChild)(result, 'usync');
        
        // Check for errors in the result node
        const resultNode = (0, WABinary_1.getBinaryNodeChild)(usyncNode, 'result');
        if (resultNode) {
            const errorNodes = (0, WABinary_1.getBinaryNodeChildren)(resultNode, 'error');
            for (const errorNode of errorNodes) {
                queryResult.errors.push({
                    code: errorNode.attrs.code,
                    text: errorNode.attrs.text,
                    jid: errorNode.attrs.jid,
                    timestamp: Date.now()
                });
            }
        }
        
        // Implement backoff strategy for failed queries
        if (queryResult.errors.length > 0) {
            const retryableErrors = queryResult.errors.filter(error => 
                error.code === '429' || // Rate limit
                error.code === '500' || // Internal server error
                error.code === '503'    // Service unavailable
            );
            
            if (retryableErrors.length > 0) {
                // Calculate exponential backoff delay
                const baseDelay = 1000; // 1 second
                const maxDelay = 30000; // 30 seconds
                const retryCount = this.retryCount || 0;
                const delay = Math.min(baseDelay * Math.pow(2, retryCount), maxDelay);
                
                queryResult.backoffDelay = delay;
                queryResult.shouldRetry = true;
            }
        }
        
        // Handle refresh scenarios
        if (this.mode === 'refresh' && resultNode) {
            const refreshNode = (0, WABinary_1.getBinaryNodeChild)(resultNode, 'refresh');
            if (refreshNode) {
                queryResult.refreshRequired = refreshNode.attrs.required === 'true';
                queryResult.refreshTimestamp = parseInt(refreshNode.attrs.timestamp) || Date.now();
            }
        }
        const listNode = (0, WABinary_1.getBinaryNodeChild)(usyncNode, 'list');
        if (Array.isArray(listNode === null || listNode === void 0 ? void 0 : listNode.content) && typeof listNode !== 'undefined') {
            queryResult.list = listNode.content.map((node) => {
                const id = node === null || node === void 0 ? void 0 : node.attrs.jid;
                const data = Array.isArray(node === null || node === void 0 ? void 0 : node.content) ? Object.fromEntries(node.content.map((content) => {
                    const protocol = content.tag;
                    const parser = protocolMap[protocol];
                    if (parser) {
                        return [protocol, parser(content)];
                    }
                    else {
                        return [protocol, null];
                    }
                }).filter(([, b]) => b !== null)) : {};
                return { ...data, id };
            });
        }
        
        // Process side list for additional metadata
        const sideListNode = (0, WABinary_1.getBinaryNodeChild)(usyncNode, 'side_list');
        if (Array.isArray(sideListNode === null || sideListNode === void 0 ? void 0 : sideListNode.content) && typeof sideListNode !== 'undefined') {
            queryResult.sideList = sideListNode.content.map((node) => {
                const id = node === null || node === void 0 ? void 0 : node.attrs.jid;
                const data = Array.isArray(node === null || node === void 0 ? void 0 : node.content) ? Object.fromEntries(node.content.map((content) => {
                    const protocol = content.tag;
                    const parser = protocolMap[protocol];
                    if (parser) {
                        return [protocol, parser(content)];
                    }
                    else {
                        return [protocol, null];
                    }
                }).filter(([, b]) => b !== null)) : {};
                return { ...data, id, isSideList: true };
            });
        }
        
        return queryResult;
    }
    withDeviceProtocol() {
        this.protocols.push(new Protocols_1.USyncDeviceProtocol());
        return this;
    }
    withContactProtocol() {
        this.protocols.push(new Protocols_1.USyncContactProtocol());
        return this;
    }
    withStatusProtocol() {
        this.protocols.push(new Protocols_1.USyncStatusProtocol());
        return this;
    }
    withDisappearingModeProtocol() {
        this.protocols.push(new Protocols_1.USyncDisappearingModeProtocol());
        return this;
    }
    withBotProfileProtocol() {
        this.protocols.push(new UsyncBotProfileProtocol_1.USyncBotProfileProtocol());
        return this;
    }
    withLIDProtocol() {
        this.protocols.push(new UsyncLIDProtocol_1.USyncLIDProtocol());
        return this;
    }
}
exports.USyncQuery = USyncQuery;
