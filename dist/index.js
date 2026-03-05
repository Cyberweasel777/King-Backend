"use strict";
/**
 * Process Group Router - King Backend
 * Entry point that routes to the correct process group based on environment
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = __importDefault(require("./config/logger"));
const processGroup = process.env.FLY_PROCESS_GROUP || 'api';
logger_1.default.info(`🚀 King Backend starting - Process Group: ${processGroup}`);
switch (processGroup) {
    case 'api':
        Promise.resolve().then(() => __importStar(require('./api/server')));
        break;
    case 'bots':
        Promise.resolve().then(() => __importStar(require('./bots/launcher')));
        break;
    case 'pipeline':
        Promise.resolve().then(() => __importStar(require('./pipeline/scheduler')));
        break;
    case 'worker':
        Promise.resolve().then(() => __importStar(require('./worker/queue')));
        break;
    default:
        logger_1.default.error(`Unknown process group: ${processGroup}`);
        process.exit(1);
}
//# sourceMappingURL=index.js.map