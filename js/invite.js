const wedding = {
      date: "2026-07-12T19:00:00+02:00"
    };

    const intro = document.getElementById("intro");
    const introVideo = document.getElementById("introVideo");
    const site = document.getElementById("site");
    const music = document.getElementById("music");
    const musicToggle = document.getElementById("musicToggle");
    const soundOn = document.getElementById("soundOn");
    const soundOff = document.getElementById("soundOff");
    const notice = document.getElementById("notice");
    const whatsappNumber = "249963594799";
    const countdown = {
      days: document.getElementById("days"),
      hours: document.getElementById("hours"),
      minutes: document.getElementById("minutes"),
      seconds: document.getElementById("seconds")
    };

    function revealInvitation() {
      if (intro.classList.contains("hide")) return;
      intro.classList.add("playing");
      introVideo.currentTime = 0;
      introVideo.play().catch(() => {});
      music.play().catch(() => {});
      updateMusicIcon();

      setTimeout(() => {
        intro.classList.add("hide");
        site.classList.add("revealed");
        document.body.classList.remove("locked");
      }, 2600);
    }

    function updateMusicIcon() {
      const muted = music.paused;
      soundOn.style.display = muted ? "none" : "block";
      soundOff.style.display = muted ? "block" : "none";
      musicToggle.setAttribute("aria-label", muted ? "تشغيل الموسيقى" : "إيقاف الموسيقى");
    }

    function updateCountdown() {
      const target = new Date(wedding.date);
      const diff = target - new Date();
      if (diff <= 0) {
        Object.values(countdown).forEach(item => item.textContent = "00");
        return;
      }

      const day = 1000 * 60 * 60 * 24;
      const hour = 1000 * 60 * 60;
      const minute = 1000 * 60;
      countdown.days.textContent = String(Math.floor(diff / day)).padStart(2, "0");
      countdown.hours.textContent = String(Math.floor((diff % day) / hour)).padStart(2, "0");
      countdown.minutes.textContent = String(Math.floor((diff % hour) / minute)).padStart(2, "0");
      countdown.seconds.textContent = String(Math.floor((diff % minute) / 1000)).padStart(2, "0");
    }

    intro.addEventListener("click", revealInvitation);
    intro.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        revealInvitation();
      }
    });

    musicToggle.addEventListener("click", () => {
      if (music.paused) {
        music.play().catch(() => {});
      } else {
        music.pause();
      }
      setTimeout(updateMusicIcon, 80);
    });

    document.getElementById("rsvpForm").addEventListener("submit", event => {
      event.preventDefault();
      const guestName = document.getElementById("guestName").value.trim();
      const attendance = document.getElementById("attendance");
      const attendanceText = attendance.options[attendance.selectedIndex].text;
      const message = document.getElementById("message").value.trim();
      const whatsappMessage = [
        "تهنئة وتأكيد حضور دعوة مهند وإسلام",
        `الاسم: ${guestName}`,
        `الحضور: ${attendanceText}`,
        message ? `الرسالة: ${message}` : ""
      ].filter(Boolean).join("\n");
      window.open(`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}`, "_blank", "noopener,noreferrer");
      notice.style.display = "block";
      event.currentTarget.reset();
    });

    updateCountdown();
    updateMusicIcon();
    setInterval(updateCountdown, 1000);
