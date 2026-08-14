(function (root, factory) {
  "use strict";

  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.SauberPlusCountdown = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function timestamp(value) {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }
    var parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }

  function getRemaining(endTime, nowTime) {
    var endMs = timestamp(endTime);
    var nowMs = timestamp(nowTime);
    if (endMs === null || nowMs === null) {
      return null;
    }

    var totalSeconds = Math.max(0, Math.ceil((endMs - nowMs) / 1000));
    return {
      totalSeconds: totalSeconds,
      days: Math.floor(totalSeconds / 86400),
      hours: Math.floor((totalSeconds % 86400) / 3600),
      minutes: Math.floor((totalSeconds % 3600) / 60),
      seconds: totalSeconds % 60,
      expired: endMs <= nowMs
    };
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function format(parts) {
    if (!parts) {
      return "00:00:00:00";
    }
    return pad(parts.days) + ":" + pad(parts.hours) + ":" + pad(parts.minutes) + ":" + pad(parts.seconds);
  }

  return {
    getRemaining: getRemaining,
    format: format,
    pad: pad
  };
});
