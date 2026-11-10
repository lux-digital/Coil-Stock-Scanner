const assert = require('node:assert/strict');
const core = require('../scanner-core');

const candidate = corners => ({corners:corners.map(([x,y])=>({x,y})),coverage:.40,fill:.96});
// Consecutive outlines from the phone trace shifted more than the previous 12px
// corner limit, even though the whole label stayed visible.
const frames = [
  candidate([[293,106],[282,539],[67,532],[53,110]]),
  candidate([[277,127],[274,517],[77,506],[68,133]]),
  candidate([[277,119],[272,493],[82,492],[75,125]])
];
assert(frames.every(frame=>core.labelReady(frame,360,640)));
assert(core.sameLiveLabel(frames[0],frames[1]));
assert(core.sameLiveLabel(frames[1],frames[2]));
assert(!core.sameLiveLabel(frames[0],candidate([[15,15],[90,15],[90,160],[15,160]])));
assert(!core.labelReady(candidate([[1,60],[275,60],[275,490],[1,490]]),360,640));
