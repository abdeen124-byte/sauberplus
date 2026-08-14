const assert = require("node:assert/strict");
const countdown = require("../js/sauberplus-countdown.js");

const end = "2026-08-16T01:02:03.000Z";
const initial = countdown.getRemaining(end, "2026-08-14T00:00:00.000Z");
assert.deepEqual(initial, {
  totalSeconds: 176523,
  days: 2,
  hours: 1,
  minutes: 2,
  seconds: 3,
  expired: false
});
assert.equal(countdown.format(initial), "02:01:02:03");

const afterReload = countdown.getRemaining(end, "2026-08-15T00:00:00.000Z");
assert.equal(afterReload.totalSeconds, initial.totalSeconds - 86400);
assert.equal(countdown.format(afterReload), "01:01:02:03");

const expired = countdown.getRemaining(end, "2026-08-17T00:00:00.000Z");
assert.equal(expired.totalSeconds, 0);
assert.equal(expired.expired, true);
assert.equal(countdown.format(expired), "00:00:00:00");

assert.equal(countdown.getRemaining("invalid", Date.now()), null);
assert.equal(countdown.format(null), "00:00:00:00");

console.log("Countdown absolute-time checks passed.");
