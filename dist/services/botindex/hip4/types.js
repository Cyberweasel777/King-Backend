"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HIP4SettlementType = exports.HIP4Status = void 0;
var HIP4Status;
(function (HIP4Status) {
    HIP4Status["PENDING"] = "PENDING";
    HIP4Status["ACTIVE"] = "ACTIVE";
    HIP4Status["SETTLED"] = "SETTLED";
    HIP4Status["EXPIRED"] = "EXPIRED";
})(HIP4Status || (exports.HIP4Status = HIP4Status = {}));
var HIP4SettlementType;
(function (HIP4SettlementType) {
    HIP4SettlementType["ORACLE"] = "ORACLE";
    HIP4SettlementType["MANUAL"] = "MANUAL";
    HIP4SettlementType["ONCHAIN"] = "ONCHAIN";
})(HIP4SettlementType || (exports.HIP4SettlementType = HIP4SettlementType = {}));
//# sourceMappingURL=types.js.map