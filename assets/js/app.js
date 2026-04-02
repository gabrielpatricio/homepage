(() => {
  const data = window.PORTFOLIO_DATA;
  const galleryTracks = window.GALLERY_TRACKS || [];
  let youTubeApiPromise = null;
  const state = {
    selectedFilters: new Set(data.filters),
    introPlayed: false,
    introReadyPromise: Promise.resolve(),
    scrollLockY: 0,
    pageScrollLocked: false,
    mobileStillsMoved: false,
    currentProject: null,
    projectStillsPage: 0,
    projectStillsPerPage: 3,
    projectStillViewerOpen: false,
    chapterPlayers: [],
    customVideoControllers: [],
    stillsScrollHandler: null,
    chapterHintTimer: null,
    projectNodeMap: new Map(),
    orientationLockAttempted: false,
    projectSeeMoreGestureCleanup: null,
    mobileProjectBackdropSrc: "",
    mobileBackdropScrollRaf: null,
    mobileBackdropKeepAliveTimer: null,
    mobileAutoplayUnlockDone: false,
    gallery: {
      flatImages: [],
      albumRanges: [],
      sequence: [],
      cardNodes: new Map(),
      albumQueue: [],
      albumQueueIndex: 0,
      activeAlbumIndex: -1,
      activeAlbumPhotoIndex: 0,
      trackQueue: [],
      currentTrackQueueIndex: 0,
      volumeLevel: 3,
      volumePointerId: null,
      draggedPositions: new Map(),
      currentIndex: 0,
      paused: false,
      interactionLockUntil: 0,
      timer: null,
      buildTimer: null,
      dragState: null
    }
  };

  const els = {
    body: document.body,
    landing: document.getElementById("landing"),
    logoTrigger: document.getElementById("logo-trigger"),
    showreel: document.getElementById("showreel"),
    filterList: document.getElementById("filter-list"),
    filterSidebar: document.querySelector(".filter-sidebar"),
    toggleFiltersButton: document.getElementById("toggle-filters-button"),
    projectStage: document.getElementById("project-stage"),
    projectOverlay: document.getElementById("project-overlay"),
    projectPanel: document.querySelector(".project-panel"),
    projectMedia: document.querySelector(".project-media"),
    projectVideoGrid: document.getElementById("project-video-grid"),
    projectType: document.getElementById("project-type"),
    projectTitle: document.getElementById("project-title"),
    projectSubtitle: document.getElementById("project-subtitle"),
    projectDescription: document.getElementById("project-description"),
    projectRole: document.getElementById("project-role"),
    projectYear: document.getElementById("project-year"),
    projectDuration: document.getElementById("project-duration"),
    projectClient: document.getElementById("project-client"),
    projectStillsGrid: document.getElementById("project-stills-grid"),
    projectStillsDots: document.getElementById("project-stills-dots"),
    projectCredits: document.getElementById("project-credits"),
    creditsToggle: document.getElementById("credits-toggle"),
    creditsGroup: document.querySelector(".credits-group"),
    projectInfoGrid: document.querySelector(".project-info-grid"),
    projectMeta: document.querySelector(".project-meta"),
    projectMetaTop: document.querySelector(".project-meta-top"),
    projectStillsShell: document.querySelector(".project-stills-shell"),
    projectStillViewer: document.getElementById("project-still-viewer"),
    projectStillViewerBackdrop: document.getElementById("project-still-viewer-backdrop"),
    projectStillViewerImage: document.getElementById("project-still-viewer-image"),
    projectStillViewerClose: document.getElementById("project-still-viewer-close"),
    galleryOverlay: document.getElementById("gallery-overlay"),
    photoStage: document.getElementById("photo-stage"),
    albumName: document.getElementById("album-name"),
    albumDetails: document.getElementById("album-details"),
    galleryAudio: document.getElementById("gallery-audio"),
    muteAudio: document.getElementById("mute-audio"),
    volumeBars: document.getElementById("volume-bars"),
    volumeLines: Array.from(document.querySelectorAll(".volume-line")),
    aboutOverlay: document.getElementById("about-overlay"),
    aboutDescription: document.getElementById("about-description"),
    aboutEmail: document.getElementById("about-email"),
    orientationGuard: document.getElementById("orientation-guard")
  };

  // Disable right click globally (prevents developer tools access)
  document.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });

  function lockPageScroll() {
    if (state.pageScrollLocked || window.innerWidth > 860) return;

    state.scrollLockY = window.scrollY || window.pageYOffset || 0;
    document.documentElement.style.overflow = "hidden";
    document.documentElement.style.height = "100%";
    els.body.style.overflow = "hidden";
    els.body.style.position = "fixed";
    els.body.style.top = `-${state.scrollLockY}px`;
    els.body.style.left = "0";
    els.body.style.right = "0";
    els.body.style.width = "100%";
    state.pageScrollLocked = true;
  }

  function unlockPageScroll() {
    if (!state.pageScrollLocked) return;

    document.documentElement.style.overflow = "";
    document.documentElement.style.height = "";
    els.body.style.overflow = "";
    els.body.style.position = "";
    els.body.style.top = "";
    els.body.style.left = "";
    els.body.style.right = "";
    els.body.style.width = "";
    window.scrollTo(0, state.scrollLockY);
    state.pageScrollLocked = false;
  }

  function shouldLockPortraitOnMobile() {
    return window.matchMedia("(max-width: 860px)").matches;
  }

  function syncOrientationGuard() {
    if (!els.orientationGuard) return;
    const isLandscape = window.matchMedia("(orientation: landscape)").matches;
    const shouldBlock = shouldLockPortraitOnMobile() && isLandscape;

    els.orientationGuard.hidden = !shouldBlock;
    els.orientationGuard.setAttribute("aria-hidden", shouldBlock ? "false" : "true");
    els.body.classList.toggle("orientation-guard-active", shouldBlock);
  }

  async function attemptPortraitOrientationLock() {
    if (state.orientationLockAttempted || !shouldLockPortraitOnMobile()) return;

    state.orientationLockAttempted = true;
    const orientationApi = window.screen?.orientation;
    if (!orientationApi || typeof orientationApi.lock !== "function") return;

    try {
      await orientationApi.lock("portrait");
    } catch (_) {
      // Many mobile browsers block orientation lock unless in fullscreen/PWA.
    }
  }

  function init() {
    assignProjectIndexes();
    hydrateSite();
    renderFilters();
    renderProjects();
    syncOrientationGuard();
    attemptPortraitOrientationLock();
    bindEvents();
    prepareGalleryData();
    state.introReadyPromise = preloadIntroAssets();

    const alreadySeenIntro = sessionStorage.getItem("portfolioIntroSeen") === "true";
    if (alreadySeenIntro || location.hash) {
      completeIntro(true);
    }
    handleRoute();
  }

  function preloadIntroAssets() {
    const imageSources = new Set();

    document.querySelectorAll(".landing-logo").forEach((logo) => {
      const src = logo.currentSrc || logo.src;
      if (src) imageSources.add(src);
    });

    data.projects.forEach((project) => {
      if (project.hidden) return;
      const firstStill = Array.isArray(project.stills) ? project.stills[0] : "";
      if (firstStill) imageSources.add(getCompressedStillSrc(firstStill));
    });

    const imageJobs = Array.from(imageSources).map((src) => preloadImageWithTimeout(src, 4500));
    const fontsReady = document.fonts?.ready ? document.fonts.ready.catch(() => {}) : Promise.resolve();

    return Promise.race([
      Promise.allSettled([fontsReady, ...imageJobs]),
      wait(7000)
    ]);
  }

  function preloadImageWithTimeout(src, timeoutMs = 4500) {
    const imagePromise = new Promise((resolve) => {
      const img = new Image();
      let settled = false;

      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      img.onload = finish;
      img.onerror = finish;
      img.src = src;

      if (img.complete) {
        finish();
      }
    });

    return Promise.race([imagePromise, wait(timeoutMs)]);
  }

  function wait(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  function isIPhoneDevice() {
    const ua = navigator.userAgent || "";
    return /iPhone/i.test(ua);
  }

  function getCompressedStillSrc(src) {
    if (!src) return "";

    const normalized = String(src);
    if (normalized.includes("/compressed/") || normalized.includes("/mobile/")) return normalized;

    const parts = normalized.split("/");
    const filename = parts.pop() || "";
    const directory = parts.join("/");
    const folder = window.innerWidth <= 860 ? "mobile" : "compressed";
    return `${directory}/${folder}/${filename}`;
  }

  function setStillImageSource(img, src) {
    if (!img || !src) return;

    const compressedSrc = getCompressedStillSrc(src);
    img.src = compressedSrc;
    img.addEventListener("error", () => {
      if (img.src !== new URL(src, window.location.href).toString()) {
        img.src = src;
      }
    }, { once: true });
  }

  function openProjectStillViewer(src, alt) {
    if (!src || !els.projectStillViewer || !els.projectStillViewerImage) return;

    if (window.innerWidth <= 640 && els.projectMeta) {
      els.projectMeta.classList.add("is-visible");
      if (els.projectStillsShell && !els.projectStillsShell.hidden) {
        els.projectStillsShell.classList.add("is-visible");
      }

      const overlayTop = els.projectOverlay.getBoundingClientRect().top;
      const targetTop = els.projectMeta.getBoundingClientRect().top - overlayTop + els.projectOverlay.scrollTop;
      els.projectOverlay.scrollTo({ top: Math.max(0, targetTop), behavior: "auto" });
    }

    els.projectStillViewerImage.src = src;
    els.projectStillViewerImage.alt = alt || "Project still";
    els.projectStillViewer.hidden = false;
    els.projectStillViewer.setAttribute("aria-hidden", "false");
    els.projectOverlay.classList.add("still-viewer-open");
    state.projectStillViewerOpen = true;
  }

  function closeProjectStillViewer() {
    if (!els.projectStillViewer || !els.projectStillViewerImage) return;

    els.projectStillViewer.hidden = true;
    els.projectStillViewer.setAttribute("aria-hidden", "true");
    els.projectStillViewerImage.removeAttribute("src");
    els.projectStillViewerImage.alt = "";
    els.projectOverlay.classList.remove("still-viewer-open");
    state.projectStillViewerOpen = false;
  }

  function assignProjectIndexes() {
    let visibleIndex = 1;

    data.projects.forEach((project) => {
      if (project.hidden) {
        delete project.index;
        return;
      }

      const formattedIndex = String(visibleIndex).padStart(2, "0");
      project.index = `[${formattedIndex}]`;
      visibleIndex += 1;
    });
  }

  function hydrateSite() {
    els.aboutDescription.innerHTML = "";
    data.site.aboutDescription
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .forEach((paragraph) => {
        const p = document.createElement("p");
        p.textContent = paragraph;
        els.aboutDescription.appendChild(p);
      });
    els.aboutEmail.textContent = data.site.email;
    els.aboutEmail.href = `mailto:${data.site.email}`;
    syncGalleryVolume();

    const iconPaths = {
      instagram: "M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Zm0 2.2A2.8 2.8 0 0 0 4.2 7v10A2.8 2.8 0 0 0 7 19.8h10a2.8 2.8 0 0 0 2.8-2.8V7A2.8 2.8 0 0 0 17 4.2H7Zm10.25 1.65a1.15 1.15 0 1 1 0 2.3 1.15 1.15 0 0 1 0-2.3ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2.2A2.8 2.8 0 1 0 12 14.8 2.8 2.8 0 0 0 12 9.2Z"
    };

    document.querySelectorAll("[data-social]").forEach((link) => {
      const key = link.dataset.social;
      const socialUrl = (data.site.socials[key] || "").trim();
      if (!socialUrl) {
        link.remove();
        return;
      }

      link.href = socialUrl;
      link.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" class="social-icon"><path d="${iconPaths[key] || ""}"></path></svg>`;
    });
  }

  function bindEvents() {
    els.logoTrigger.addEventListener("click", playIntro);

    window.addEventListener("hashchange", handleRoute);
    window.addEventListener("resize", debounce(() => {
      renderProjects();
      queueMobileBackdropScrollSync();
      syncOrientationGuard();
      attemptPortraitOrientationLock();
    }, 120));
    window.addEventListener("scroll", queueMobileBackdropScrollSync, { passive: true });
    document.addEventListener("scroll", queueMobileBackdropScrollSync, { passive: true });
    els.showreel?.addEventListener("scroll", queueMobileBackdropScrollSync, { passive: true });
    els.projectStage?.addEventListener("scroll", queueMobileBackdropScrollSync, { passive: true });
    window.addEventListener("touchmove", queueMobileBackdropScrollSync, { passive: true });
    els.showreel?.addEventListener("pointerdown", ensureMobileBackdropPlayback, { passive: true });
    els.showreel?.addEventListener("touchstart", ensureMobileBackdropPlayback, { passive: true });
    window.addEventListener("orientationchange", syncOrientationGuard);
    window.addEventListener("pointerdown", unlockMobileAutoplayOnce, { once: true, passive: true });
    window.addEventListener("touchstart", unlockMobileAutoplayOnce, { once: true, passive: true });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        syncOrientationGuard();
        attemptPortraitOrientationLock();
        ensureMobileBackdropPlayback();
      }
    });
    window.addEventListener("keydown", handleGalleryKeydown);
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && state.projectStillViewerOpen) {
        closeProjectStillViewer();
      }
    });

    els.toggleFiltersButton?.addEventListener("click", () => {
      els.filterSidebar.classList.toggle("is-open");
    });

    document.querySelectorAll(".close-overlay").forEach((button) => {
      button.addEventListener("click", () => {
        location.hash = "#showreel";
      });
    });

    els.projectStillViewerBackdrop?.addEventListener("click", closeProjectStillViewer);
    els.projectStillViewerClose?.addEventListener("click", closeProjectStillViewer);

    els.creditsToggle.addEventListener("click", () => {
      const expanded = els.creditsToggle.getAttribute("aria-expanded") === "true";
      els.creditsToggle.setAttribute("aria-expanded", String(!expanded));
      els.projectCredits.hidden = expanded;
    });

    els.galleryAudio.addEventListener("ended", handleGalleryTrackEnd);
    els.muteAudio.addEventListener("click", toggleGalleryMute);
    els.volumeLines.forEach((line) => {
      line.addEventListener("click", () => {
        const level = Number(line.dataset.volumeLevel || 3);
        state.gallery.volumeLevel = level;
        if (els.galleryAudio.muted) {
          els.galleryAudio.muted = false;
          els.muteAudio.setAttribute("aria-pressed", "false");
          els.muteAudio.textContent = "mute";
        }
        syncGalleryVolume();
      });
    });

    els.volumeBars.addEventListener("pointerdown", (event) => {
      state.gallery.volumePointerId = event.pointerId;
      els.volumeBars.setPointerCapture(event.pointerId);
      setVolumeFromPointerEvent(event);
      event.preventDefault();
    });

    els.volumeBars.addEventListener("pointermove", (event) => {
      if (state.gallery.volumePointerId !== event.pointerId) return;
      setVolumeFromPointerEvent(event);
    });

    const onVolumePointerEnd = (event) => {
      if (state.gallery.volumePointerId !== event.pointerId) return;
      setVolumeFromPointerEvent(event);
      els.volumeBars.releasePointerCapture(event.pointerId);
      state.gallery.volumePointerId = null;
    };

    els.volumeBars.addEventListener("pointerup", onVolumePointerEnd);
    els.volumeBars.addEventListener("pointercancel", onVolumePointerEnd);

    const retryOrientationLock = () => {
      attemptPortraitOrientationLock();
    };
    document.addEventListener("pointerdown", retryOrientationLock, { once: true });
  }

  function unlockMobileAutoplayOnce() {
    if (state.mobileAutoplayUnlockDone || window.innerWidth > 860) return;
    state.mobileAutoplayUnlockDone = true;

    // Always try to resume the mobile backdrop on first user gesture.
    resumeMobileBackdropMuted();

    // iPhone project videos are intentionally manual-play; do not force autoplay.
    if (isIPhoneDevice()) return;

    state.chapterPlayers.forEach((player) => {
      player.setMuted(true).catch(() => {});
      player.play().catch(() => {});
    });

    state.customVideoControllers.forEach((controller) => {
      if (controller && typeof controller.play === "function") {
        controller.play();
      }
    });
  }

  function resumeMobileBackdropMuted() {
    const backdropFrame = els.showreel?.querySelector(".project-stage-mobile-backdrop__frame");
    if (!backdropFrame) return;

    const src = backdropFrame.getAttribute("src") || "";
    const lowerSrc = src.toLowerCase();
    const win = backdropFrame.contentWindow;
    if (!win) return;

    try {
      if (lowerSrc.includes("youtube.com") || lowerSrc.includes("youtu.be")) {
        win.postMessage('{"event":"command","func":"mute","args":""}', "*");
        win.postMessage('{"event":"command","func":"playVideo","args":""}', "*");
      } else if (lowerSrc.includes("vimeo.com")) {
        win.postMessage('{"method":"setMuted","value":true}', "*");
        win.postMessage('{"method":"play"}', "*");
      }
    } catch (_) {
      // Ignore cross-origin command issues.
    }
  }

  function stopMobileBackdropKeepAlive() {
    if (!state.mobileBackdropKeepAliveTimer) return;
    window.clearInterval(state.mobileBackdropKeepAliveTimer);
    state.mobileBackdropKeepAliveTimer = null;
  }

  function ensureMobileBackdropPlayback() {
    const isMobile = window.innerWidth <= 860;
    const onShowreelRoute = location.hash.replace(/^#/, "").split("/")[0] === "showreel";
    const hasBackdropFrame = Boolean(els.showreel?.querySelector(".project-stage-mobile-backdrop__frame"));

    if (!isMobile || !onShowreelRoute || !hasBackdropFrame || document.hidden) {
      stopMobileBackdropKeepAlive();
      return;
    }

    resumeMobileBackdropMuted();

    if (state.mobileBackdropKeepAliveTimer) return;
    state.mobileBackdropKeepAliveTimer = window.setInterval(() => {
      const frame = els.showreel?.querySelector(".project-stage-mobile-backdrop__frame");
      const stillOnShowreel = location.hash.replace(/^#/, "").split("/")[0] === "showreel";
      if (!frame || !stillOnShowreel || document.hidden || window.innerWidth > 860) {
        stopMobileBackdropKeepAlive();
        return;
      }
      resumeMobileBackdropMuted();
    }, 900);
  }

  async function playIntro() {
    if (state.introPlayed) return;
    state.introPlayed = true;
    document.body.classList.add("intro-loading");
    sessionStorage.setItem("portfolioIntroSeen", "true");

    try {
      await state.introReadyPromise;
    } catch (_) {
      // Intro should never block even if a preload call fails unexpectedly.
    }

    document.body.classList.add("intro-start");
    document.body.classList.remove("intro-loading");

    window.setTimeout(() => {
      completeIntro(false);
      if (!location.hash || location.hash === "#") {
        location.hash = "#showreel";
      }
    }, 2450);
  }

  function completeIntro(immediate = false) {
    document.body.classList.remove("intro-loading");
    document.body.classList.remove("intro-start");
    document.body.classList.add("intro-complete");
    if (immediate) {
      els.landing.style.transition = "none";
    }
  }

  function renderFilters() {
    els.filterList.innerHTML = "";
    data.filters.forEach((filter) => {
      const id = `filter-${filter.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      const label = document.createElement("label");
      label.className = "filter-item";
      label.innerHTML = `
        <input id="${id}" type="checkbox" checked />
        <span>${filter}</span>
      `;
      const input = label.querySelector("input");
      input.addEventListener("change", () => {
        if (input.checked) {
          state.selectedFilters.add(filter);
        } else {
          state.selectedFilters.delete(filter);
        }
        updateProjectVisibility();
      });
      els.filterList.appendChild(label);
    });
  }

  function getVisibleProjects() {
    if (state.selectedFilters.size === 0) return [];
    return data.projects.filter((project) =>
      !project.hidden && project.categories.some((category) => state.selectedFilters.has(category))
    );
  }

  function renderProjects() {
    els.projectStage.innerHTML = "";
    state.projectNodeMap.clear();
    const renderableProjects = data.projects.filter((project) => !project.hidden);

    renderMobileProjectBackdrop();

    if (window.innerWidth <= 860) {
      const mobileProjects = [...renderableProjects].reverse();
      mobileProjects.forEach((project) => {
        const node = buildProjectNode(project);
        els.projectStage.appendChild(node);
        state.projectNodeMap.set(project.slug, node);
      });
      updateProjectVisibility();
      return;
    }

    const sidebarRight = els.filterSidebar
      ? els.filterSidebar.getBoundingClientRect().right + 24
      : 270;

    const bounds = {
      width: els.projectStage.clientWidth || window.innerWidth,
      height: window.innerHeight,
      minX: sidebarRight,
      minY: 20,
      maxX: (els.projectStage.clientWidth || window.innerWidth) - 250,
      maxY: window.innerHeight - 140
    };

    const placed = [];

    renderableProjects.forEach((project, index) => {
      const node = buildProjectNode(project);
      els.projectStage.appendChild(node);
      state.projectNodeMap.set(project.slug, node);

      const size = estimateProjectSize(project);
      const pos = findNonOverlappingPosition(project.slug, size, bounds, placed, index);
      node.style.left = `${pos.x}px`;
      node.style.top = `${pos.y}px`;
      node.style.setProperty("--float-x", `${pos.floatX}px`);
      node.style.setProperty("--float-y", `${pos.floatY}px`);
      node.style.setProperty("--float-duration", `${pos.duration}s`);
      node.style.setProperty("--float-delay", `${pos.delay}s`);
      placed.push({ ...pos, width: size.width, height: size.height });
    });

    updateProjectVisibility();
  }

  function renderMobileProjectBackdrop() {
    const existing = els.showreel?.querySelector(".project-stage-mobile-backdrop");
    if (existing) existing.remove();

    if (window.innerWidth > 860 || !state.mobileProjectBackdropSrc || !els.showreel) {
      return;
    }

    const shell = document.createElement("div");
    shell.className = "project-stage-mobile-backdrop";
    shell.setAttribute("aria-hidden", "true");

    const frame = document.createElement("iframe");
    frame.className = "project-stage-mobile-backdrop__frame";
    frame.allow = "autoplay; fullscreen; picture-in-picture";
    frame.setAttribute("allowfullscreen", "");
    frame.setAttribute("playsinline", "");
    frame.tabIndex = -1;
    frame.src = state.mobileProjectBackdropSrc;
    frame.addEventListener("load", () => {
      resumeMobileBackdropMuted();
      ensureMobileBackdropPlayback();
    });

    shell.appendChild(frame);
    els.showreel.insertBefore(shell, els.projectStage);
    syncMobileBackdropScroll();
    
    // Ensure video plays after iframe loads
    window.setTimeout(() => {
      resumeMobileBackdropMuted();
      ensureMobileBackdropPlayback();
    }, 500);
  }

  function syncMobileBackdropScroll() {
    const frame = els.showreel?.querySelector(".project-stage-mobile-backdrop__frame");
    if (!frame || window.innerWidth > 860) return;

    // Keep backdrop locked to viewport center.
    frame.style.removeProperty("--mobile-backdrop-scroll");
  }

  function queueMobileBackdropScrollSync() {
    if (state.mobileBackdropScrollRaf) return;

    state.mobileBackdropScrollRaf = window.requestAnimationFrame(() => {
      state.mobileBackdropScrollRaf = null;
      syncMobileBackdropScroll();
    });
  }

  function extractYouTubeVideoId(urlString) {
    try {
      const parsed = new URL(urlString, window.location.href);
      const host = parsed.hostname.toLowerCase();
      if (host.includes("youtu.be")) {
        return parsed.pathname.replace(/^\//, "").split("/")[0] || "";
      }

      const fromQuery = parsed.searchParams.get("v");
      if (fromQuery) return fromQuery;

      const parts = parsed.pathname.split("/").filter(Boolean);
      const embedIndex = parts.indexOf("embed");
      if (embedIndex !== -1 && parts[embedIndex + 1]) {
        return parts[embedIndex + 1];
      }
    } catch (_) {
      // Ignore malformed URLs.
    }

    return "";
  }

  function buildMobileBackdropVideoUrl(rawUrl) {
    const base = normalizeEmbedUrl(rawUrl, {
      autoplay: true,
      muted: true,
      customUI: true
    });

    if (!base) return "";

    try {
      const parsed = new URL(base, window.location.href);
      const host = parsed.hostname.toLowerCase();
      parsed.searchParams.set("autoplay", "1");
      parsed.searchParams.set("muted", "1");
      parsed.searchParams.set("mute", "1");
      parsed.searchParams.set("playsinline", "1");
      parsed.searchParams.set("loop", "1");
      parsed.searchParams.set("autopause", "0");

      if (host.includes("youtube.com") || host.includes("youtu.be")) {
        const videoId = extractYouTubeVideoId(base) || extractYouTubeVideoId(rawUrl);
        if (videoId) {
          parsed.searchParams.set("playlist", videoId);
        }
      }

      if (host.includes("vimeo.com")) {
        parsed.searchParams.set("background", "1");
      }

      return parsed.toString();
    } catch (_) {
      return base;
    }
  }

  function updateMobileBackdropFromProject(project) {
    if (window.innerWidth > 860 || !project || project.chapterPage || project.fullPage) {
      return;
    }

    const embeds = Array.isArray(project.videoEmbed)
      ? project.videoEmbed
      : [project.videoEmbed];
    const firstEmbed = embeds.find(Boolean);
    if (!firstEmbed) return;

    const backdropUrl = buildMobileBackdropVideoUrl(firstEmbed);
    if (!backdropUrl) return;

    state.mobileProjectBackdropSrc = backdropUrl;
  }

  function updateProjectVisibility() {
    const visibleSlugs = new Set(getVisibleProjects().map((p) => p.slug));
    const isMobile = window.innerWidth <= 860;
    state.projectNodeMap.forEach((node, slug) => {
      const visible = visibleSlugs.has(slug);
      if (isMobile) {
        node.style.display = visible ? "" : "none";
      } else {
        node.style.opacity = visible ? "" : "0";
        node.style.pointerEvents = visible ? "" : "none";
      }
      node.setAttribute("aria-hidden", visible ? "false" : "true");
    });
  }

  function buildProjectNode(project) {
    const link = document.createElement("a");
    link.href = `#project/${project.slug}`;
    link.className = `project-item highlight-${project.highlight}`;
    link.dataset.slug = project.slug;
    link.innerHTML = `
      <span class="project-index">${project.index}</span>
      <span class="project-title">${project.title}</span>
      <span class="project-meta-line">
        <span>${project.role}</span>
        <span>${project.year}</span>
        <span>${project.type}</span>
      </span>
    `;

    link.addEventListener("mouseenter", () => activateProjectHover(link, project));
    link.addEventListener("mouseleave", () => deactivateProjectHover(link));
    link.addEventListener("focus", () => activateProjectHover(link, project));
    link.addEventListener("blur", () => deactivateProjectHover(link));

    return link;
  }

  function estimateProjectSize(project) {
    const base = { width: 180, height: 88 };
    if (project.highlight === 2) return { width: 280, height: 110 };
    if (project.highlight === 3) return { width: 460, height: 150 };
    return base;
  }

  function seededRandom(seed) {
    let h = 1779033703 ^ seed.length;
    for (let i = 0; i < seed.length; i++) {
      h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    };
  }

  function findNonOverlappingPosition(seed, size, bounds, placed, index) {
    const rand = seededRandom(`${seed}-${window.innerWidth}-${window.innerHeight}`);
    let best = null;
    const motionInset = 28;
    const safeMinX = bounds.minX + motionInset;
    const safeMinY = bounds.minY + motionInset;
    const safeMaxX = bounds.maxX - size.width - motionInset;
    const safeMaxY = bounds.maxY - size.height - motionInset;

    for (let attempt = 0; attempt < 240; attempt++) {
      const x = safeMinX + rand() * Math.max(20, safeMaxX - safeMinX);
      const y = safeMinY + rand() * Math.max(20, safeMaxY - safeMinY);
      const candidate = { x, y, width: size.width, height: size.height };
      const overlap = placed.some((box) => boxesOverlap(candidate, box, 34));

      if (!overlap) {
        const signX = rand() < 0.5 ? -1 : 1;
        const signY = rand() < 0.5 ? -1 : 1;
        return {
          x,
          y,
          floatX: signX * (18 + rand() * 8),
          floatY: signY * (18 + rand() * 8),
          duration: 10 + rand() * 2,
          delay: rand() * 3
        };
      }

      if (!best) {
        best = candidate;
      }
    }

    const signX = rand() < 0.5 ? -1 : 1;
    const signY = rand() < 0.5 ? -1 : 1;

    // Keep deterministic fallback slots inside the available stage area.
    const availableWidth = Math.max(1, safeMaxX - safeMinX);
    const availableHeight = Math.max(1, safeMaxY - safeMinY);
    const columnCount = Math.max(1, Math.floor((availableWidth + 24) / Math.max(190, size.width + 20)));
    const rowCount = Math.max(1, Math.floor((availableHeight + 16) / Math.max(84, size.height + 14)));
    const slotCount = Math.max(1, columnCount * rowCount);
    const safeIndex = index % slotCount;
    const col = safeIndex % columnCount;
    const row = Math.floor(safeIndex / columnCount);
    const fallbackX = safeMinX + (columnCount === 1 ? availableWidth / 2 : (availableWidth * col) / (columnCount - 1));
    const fallbackY = safeMinY + (rowCount === 1 ? availableHeight / 2 : (availableHeight * row) / (rowCount - 1));

    return {
      x: fallbackX,
      y: fallbackY,
      floatX: signX * (18 + rand() * 8),
      floatY: signY * (18 + rand() * 8),
      duration: 10 + rand() * 2,
      delay: rand() * 3
    };
  }

  function boxesOverlap(a, b, padding = 0) {
    return !(
      a.x + a.width + padding < b.x ||
      a.x > b.x + b.width + padding ||
      a.y + a.height + padding < b.y ||
      a.y > b.y + b.height + padding
    );
  }

  function activateProjectHover(link, project) {
    if (window.innerWidth <= 860) return;
    els.projectStage.classList.add("hover-active");
    link.classList.add("is-active");
    renderPreviewStrips(link, project);
  }

  function deactivateProjectHover(link) {
    els.projectStage.classList.remove("hover-active");
    link.classList.remove("is-active");
    link.querySelectorAll(".preview-strip").forEach((node) => node.remove());
  }

  function renderPreviewStrips(link, project) {
    link.querySelectorAll(".preview-strip").forEach((node) => node.remove());

    const rect = link.getBoundingClientRect();
    const viewport = {
      top: rect.top,
      left: rect.left,
      right: window.innerWidth - rect.right,
      bottom: window.innerHeight - rect.bottom
    };

    const thumbWidth = Math.min(420, Math.max(240, window.innerWidth * 0.24));
    const stripCapacity = {
      right: Math.max(0, Math.min(3, Math.floor(viewport.right / (thumbWidth + 20)))),
      left: Math.max(0, Math.min(3, Math.floor(viewport.left / (thumbWidth + 20)))),
      top: Math.max(0, Math.min(3, Math.floor((rect.width + 90) / (thumbWidth + 20)))),
      bottom: Math.max(0, Math.min(3, Math.floor((rect.width + 90) / (thumbWidth + 20))))
    };

    const directions = Object.entries(stripCapacity)
      .filter(([, capacity]) => capacity > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([dir]) => dir);

    if (directions.length === 0) directions.push("right");

    let remaining = [...project.stills];

    directions.forEach((dir) => {
      if (!remaining.length) return;
      const cap = Math.min(stripCapacity[dir] || 3, 3, remaining.length);
      if (!cap) return;

      const strip = document.createElement("div");
      strip.className = `preview-strip dir-${dir}`;

      remaining.splice(0, cap).forEach((src) => {
        const img = document.createElement("img");
        img.className = "preview-image";
        setStillImageSource(img, src);
        img.alt = `${project.title} still`;
        strip.appendChild(img);
      });

      link.appendChild(strip);
    });
  }

  function handleRoute() {
    const hash = location.hash.replace(/^#/, "");
    const [route, slug] = hash.split("/");

    document.body.classList.remove("route-showreel", "route-35mm", "route-about", "route-project");

    if (!route || route === "") {
      if (!document.body.classList.contains("intro-complete")) {
        return;
      }
      document.body.classList.add("route-showreel");
      return;
    }

    if (route === "showreel") {
      closeAllOverlays({ keepBackdropFromCurrentProject: true });
      document.body.classList.add("route-showreel");
      stopGallery();
      renderMobileProjectBackdrop();
      ensureMobileBackdropPlayback();
      return;
    }

    if (route === "35mm") {
      stopMobileBackdropKeepAlive();
      closeAllOverlays();
      els.galleryOverlay.classList.add("active");
      els.galleryOverlay.setAttribute("aria-hidden", "false");
      document.body.classList.add("route-35mm");
      lockPageScroll();
      openGallery();
      return;
    }

    if (route === "about") {
      stopMobileBackdropKeepAlive();
      closeAllOverlays();
      els.aboutOverlay.classList.add("active");
      els.aboutOverlay.setAttribute("aria-hidden", "false");
      document.body.classList.add("route-about");
      lockPageScroll();
      stopGallery();
      return;
    }

    if (route === "project" && slug) {
      const project = data.projects.find((item) => item.slug === slug && !item.hidden);
      if (project) {
        stopMobileBackdropKeepAlive();
        closeAllOverlays();
        populateProjectOverlay(project);
        els.projectOverlay.classList.add("active");
        els.projectOverlay.setAttribute("aria-hidden", "false");
        document.body.classList.add("route-project");
        lockPageScroll();
        stopGallery();
        return;
      }
    }

    location.hash = "#showreel";
  }

  function closeAllOverlays(options = {}) {
    const wasProjectOverlayActive = els.projectOverlay.classList.contains("active");
    const lastProject = state.currentProject;

    closeProjectStillViewer();
    unlockPageScroll();
    [els.projectOverlay, els.galleryOverlay, els.aboutOverlay].forEach((overlay) => {
      overlay.classList.remove("active");
      overlay.setAttribute("aria-hidden", "true");
    });
    state.chapterPlayers.forEach((p) => p.destroy().catch(() => {}));
    state.chapterPlayers = [];
    if (state.chapterHintTimer) {
      window.clearTimeout(state.chapterHintTimer);
      state.chapterHintTimer = null;
    }
    const chapterHint = els.projectPanel.querySelector(".chapter-mobile-play-hint");
    if (chapterHint) chapterHint.remove();
    state.customVideoControllers.forEach((controller) => {
      if (controller && typeof controller.destroy === "function") {
        controller.destroy();
      }
    });
    state.customVideoControllers = [];
    
    // Clean up full-page mobile autoplay observer and gesture handlers
    if (state.fullPageAutoplayObserver) {
      state.fullPageAutoplayObserver.disconnect();
      state.fullPageAutoplayObserver = null;
    }
    if (state.fullPageScrollHandler) {
      state.fullPageScrollHandler();
      state.fullPageScrollHandler = null;
    }
    if (state.projectSeeMoreGestureCleanup) {
      state.projectSeeMoreGestureCleanup();
      state.projectSeeMoreGestureCleanup = null;
    }
    state.fullPageVideosMap = null;
    
    els.projectPanel.classList.remove("is-full-page");
    els.projectPanel.classList.remove("is-chapter-page");
    els.projectPanel.classList.remove("has-stills");
    els.projectOverlay.classList.remove("is-full-page-project");
    els.projectOverlay.classList.remove("is-chapter-page-project");
    els.projectVideoGrid.innerHTML = "";
    delete els.projectVideoGrid.dataset.videoCount;
    delete els.projectVideoGrid.dataset.chapterLayout;
    els.projectStillsShell.hidden = false;
    els.projectStillsGrid.hidden = false;
    if (state.stillsScrollHandler) {
      els.projectStillsGrid.removeEventListener("scroll", state.stillsScrollHandler);
      state.stillsScrollHandler = null;
    }
    if (els.projectStillsDots) { els.projectStillsDots.innerHTML = ""; els.projectStillsDots.hidden = true; }
    state.projectStillsPage = 0;
    els.projectInfoGrid.hidden = false;
    els.creditsGroup.hidden = false;
    els.projectCredits.hidden = true;
    els.creditsToggle.setAttribute("aria-expanded", "false");
    
    // Clean up mobile footer elements
    let footerLeft = els.projectPanel.querySelector(".project-footer-left");
    if (!footerLeft) footerLeft = els.projectOverlay.querySelector(".project-footer-left");
    let seeMoreBtn = els.projectPanel.querySelector(".project-see-more");
    if (!seeMoreBtn) seeMoreBtn = els.projectOverlay.querySelector(".project-see-more");
    if (footerLeft) footerLeft.remove();
    if (seeMoreBtn) seeMoreBtn.remove();
    
    // Reset project-meta visibility
    els.projectMeta.classList.remove("is-visible");
    els.projectStillsShell.classList.remove("is-visible");

    if (state.mobileStillsMoved) {
      els.projectMedia.appendChild(els.projectStillsShell);
      state.mobileStillsMoved = false;
    }

    const closeMetaBtn = els.projectMeta.querySelector(".close-meta");
    if (closeMetaBtn) closeMetaBtn.remove();

    if (options.keepBackdropFromCurrentProject && wasProjectOverlayActive) {
      updateMobileBackdropFromProject(lastProject);
    } else {
      state.mobileProjectBackdropSrc = "";
    }

    renderMobileProjectBackdrop();
    ensureMobileBackdropPlayback();
  }

  function populateProjectOverlay(project) {
    state.currentProject = project;
    const isFullPage = Boolean(project.fullPage);
    const isChapterPage = Boolean(project.chapterPage);
    const hasDescription = Boolean(project.description);
    const hasSubtitle = Boolean(project.subtitle);
    const hasCredits = Array.isArray(project.credits) && project.credits.length > 0;
    const hasStills = !project.hideStills && Array.isArray(project.stills) && project.stills.length > 0;

    els.projectPanel.classList.toggle("is-full-page", isFullPage);
    els.projectPanel.classList.toggle("is-chapter-page", isChapterPage);
    els.projectPanel.classList.toggle("has-stills", hasStills);
    els.projectOverlay.classList.toggle("is-full-page-project", isFullPage);
    els.projectOverlay.classList.toggle("is-chapter-page-project", isChapterPage);
    els.projectType.textContent = project.type;
    els.projectTitle.textContent = project.title;
    els.projectSubtitle.textContent = project.subtitle || "";
    els.projectSubtitle.hidden = !hasSubtitle;
    els.projectDescription.textContent = project.description || "";
    els.projectDescription.hidden = !hasDescription;
    els.projectRole.textContent = project.role || "";
    els.projectRole.parentElement.hidden = !project.role;
    els.projectYear.textContent = project.year || "";
    els.projectYear.parentElement.hidden = !project.year;
    els.projectDuration.textContent = project.duration || "";
    els.projectDuration.parentElement.hidden = !project.duration;
    els.projectClient.textContent = project.client || "";
    els.projectClient.parentElement.hidden = !project.client;
    const videoEmbeds = Array.isArray(project.videoEmbed)
      ? project.videoEmbed
      : [project.videoEmbed];
    const rawEmbeds = videoEmbeds.filter(Boolean);
    const orientations = getVideoOrientations(project, rawEmbeds.length);
    const aspectRatios = getVideoAspectRatios(project, rawEmbeds.length, orientations);

    els.projectVideoGrid.innerHTML = "";
    els.projectVideoGrid.dataset.videoCount = String(rawEmbeds.length);
    els.projectVideoGrid.dataset.projectSlug = project.slug;
    if (isChapterPage && rawEmbeds.length > 4) {
      els.projectVideoGrid.dataset.chapterLayout = "featured-first";
    } else {
      delete els.projectVideoGrid.dataset.chapterLayout;
    }

    rawEmbeds.forEach((rawUrl, index) => {
      const provider = detectVideoProvider(rawUrl);
      const shouldUseCustomUi = !isChapterPage && (provider === "vimeo" || provider === "youtube");
      const isIPhone = isIPhoneDevice();
      const isMobileDevice = window.innerWidth <= 860;
      // For full-page mobile projects, only the first video should autoplay on load
      const shouldAutoplayBase = (isChapterPage && !isMobileDevice) || (shouldUseCustomUi && !isFullPage) || (isFullPage && window.innerWidth > 640) || (isFullPage && window.innerWidth <= 640 && index === 0);
      const shouldAutoplay = isIPhone ? false : shouldAutoplayBase;
      // iOS Safari only allows autoplay when the iframe URL has muted=1; force it on mobile
      const videoUrl = normalizeEmbedUrl(rawUrl, {
        autoplay: shouldAutoplay,
        muted: shouldAutoplay ? (index !== 0 || isMobileDevice) : false,
        customUI: !isChapterPage && (provider === "vimeo" || provider === "youtube"),
        suppressNativeControls: isChapterPage
      });
      if (!videoUrl) return;

      const shell = document.createElement("div");
      shell.className = "video-shell";
      shell.dataset.orientation = orientations[index] || "horizontal";
      if (isFullPage) {
        applyFullPageGridPlacement(shell, index, orientations, rawEmbeds.length);
      }

      const ratio = document.createElement("div");
      ratio.className = "video-ratio";
      ratio.style.aspectRatio = aspectRatios[index] || "16 / 9";

      const frame = document.createElement("iframe");
      frame.title = `${project.title} video ${index + 1}`;
      frame.allow = "autoplay; fullscreen; picture-in-picture";
      frame.setAttribute("allowfullscreen", "");
      frame.setAttribute("playsinline", "");
      frame.loading = isChapterPage ? "eager" : "lazy";
      frame.id = `project-video-${project.slug}-${index}`;
      frame.src = videoUrl;

      ratio.appendChild(frame);
      shell.appendChild(ratio);

      if (isChapterPage && provider === "vimeo" && typeof Vimeo !== "undefined") {
        // Use custom play/pause controls for chapter pages.
        const isMobileChapterLayout = isMobileDevice;
        const showChapterMuteButton = true;
        const isFirstChapterVideo = index === 0;
        const isMuted = isMobileChapterLayout ? true : (isIPhone ? true : (index !== 0));
        const ps = { paused: true, muted: isMuted };
        let mobileControlsHideTimer = null;
        const player = new Vimeo.Player(frame);
        state.chapterPlayers.push(player);

        // Auto-start playback after player is ready
        player.ready().then(() => {
          player.setMuted(isMuted).then(() => {
            if (isIPhone) return;
            // Add a small delay before play attempt - helps on iOS
            return new Promise(resolve => setTimeout(resolve, 100)).then(() => player.play());
          }).catch((error) => {
            // Log but don't fail - autoplay may be blocked
            console.debug("Video autoplay failed:", error);
          });
        }).catch((error) => {
          console.debug("Vimeo player ready failed:", error);
        });

        const playBtn = document.createElement("button");
        playBtn.type = "button";
        playBtn.className = "video-play-ctrl";
        playBtn.textContent = "play";
        playBtn.setAttribute("aria-label", "Play video");

        const muteBtn = document.createElement("button");
        muteBtn.type = "button";
        muteBtn.className = "video-mute-ctrl";
        muteBtn.textContent = isMuted ? "unmute" : "mute";
        muteBtn.setAttribute("aria-label", isMuted ? "Unmute video" : "Mute video");

        player.on("play", () => {
          ps.paused = false;
          playBtn.textContent = "pause";
          playBtn.setAttribute("aria-label", "Pause video");
          showMobileControls();
        });
        player.on("pause", () => {
          ps.paused = true;
          playBtn.textContent = "play";
          playBtn.setAttribute("aria-label", "Play video");
          showMobileControls();
        });

        playBtn.addEventListener("click", () => {
          if (ps.paused) {
            if (isIPhone) {
              // Keep play() in the same user gesture on iOS to prevent blocked playback.
              // Do not force-unmute, which can make concurrent chapter videos stall on iPhone.
              if (isMobileChapterLayout && isFirstChapterVideo) {
                player.setMuted(false).then(() => {
                  ps.muted = false;
                  muteBtn.textContent = "mute";
                  muteBtn.setAttribute("aria-label", "Mute video");
                }).catch(() => {});
              }
              player.play().catch(() => {});
            } else {
              if (isMobileChapterLayout && isFirstChapterVideo) {
                player.setMuted(false).then(() => {
                  ps.muted = false;
                  muteBtn.textContent = "mute";
                  muteBtn.setAttribute("aria-label", "Mute video");
                }).catch(() => {});
              }
              player.play().catch(() => {});
            }
          } else {
            player.pause().catch(() => {});
          }
        });
        muteBtn.addEventListener("click", () => {
          const next = !ps.muted;
          player.setMuted(next).then(() => {
            ps.muted = next;
            muteBtn.textContent = next ? "unmute" : "mute";
            muteBtn.setAttribute("aria-label", next ? "Unmute video" : "Mute video");
          }).catch(() => {});
        });

        const muteWrapper = document.createElement("div");
        muteWrapper.className = "video-mute-wrapper";
        muteWrapper.appendChild(muteBtn);

        const showMobileControls = () => {
          if (!isMobileChapterLayout) return;
          playBtn.classList.add("is-visible");
          playBtn.classList.remove("is-inactive");
          muteWrapper.classList.remove("is-inactive");
          if (mobileControlsHideTimer) {
            window.clearTimeout(mobileControlsHideTimer);
          }
          mobileControlsHideTimer = window.setTimeout(() => {
            playBtn.classList.remove("is-visible");
            playBtn.classList.add("is-inactive");
            muteWrapper.classList.add("is-inactive");
          }, 2000);
        };

        shell.appendChild(playBtn);
        if (showChapterMuteButton) {
          shell.appendChild(muteWrapper);
        }
        if (isMobileChapterLayout) {
          showMobileControls();
          [shell, playBtn, muteBtn].forEach((element) => {
            element.addEventListener("pointerdown", showMobileControls);
            element.addEventListener("pointermove", showMobileControls);
            element.addEventListener("touchstart", showMobileControls, { passive: true });
          });
        }
      } else if (isChapterPage && provider === "youtube") {
        const startMutedForMobile = isMobileDevice ? true : (isIPhone ? false : (index !== 0));
        const controller = createStandardVideoControls({
          shell,
          ratio,
          frame,
          provider,
          autoPlay: !isMobileDevice && !isIPhone,
          startMuted: startMutedForMobile,
          forceUnmutedOnFirstPlay: isMobileDevice && index === 0
        });
        if (controller) {
          state.customVideoControllers.push(controller);
        }
      } else if (!isChapterPage) {
        // For full-page mobile projects, autoplay only the first video initially
        const shouldAutoPlayVideoBase = !isFullPage || window.innerWidth > 640 || (isFullPage && window.innerWidth <= 640 && index === 0);
        const shouldAutoPlayVideo = isIPhone ? false : shouldAutoPlayVideoBase;
        // On mobile start muted (iOS autoplay requirement); user can unmute via button
        const startMutedForMobile = isIPhone ? false : (index !== 0 || (shouldAutoPlayVideo && window.innerWidth <= 860));
        const controller = createStandardVideoControls({
          shell,
          ratio,
          frame,
          provider,
          autoPlay: shouldAutoPlayVideo,
          startMuted: startMutedForMobile
        });
        if (controller) {
          state.customVideoControllers.push(controller);
        }
      }

      els.projectVideoGrid.appendChild(shell);
    });

    if (state.chapterHintTimer) {
      window.clearTimeout(state.chapterHintTimer);
      state.chapterHintTimer = null;
    }
    const existingChapterHint = els.projectPanel.querySelector(".chapter-mobile-play-hint");
    if (existingChapterHint) existingChapterHint.remove();
    if (isChapterPage && window.innerWidth <= 860) {
      const chapterHint = document.createElement("p");
      chapterHint.className = "chapter-mobile-play-hint";
      chapterHint.textContent = "For the best experience, press play on all videos to view them simultaneously.";
      els.projectMedia.appendChild(chapterHint);
      // Fade-in delay, hold, and fade-out are handled entirely by the CSS animation.
    }

    els.projectStillsGrid.innerHTML = "";
    els.projectStillsShell.hidden = !hasStills;
    els.projectStillsGrid.hidden = !hasStills;
    if (hasStills) {
      renderProjectStillsPage(project);
    }

    if (window.innerWidth <= 640 && !isFullPage && hasStills) {
      els.projectPanel.insertBefore(els.projectStillsShell, els.projectMeta);
      state.mobileStillsMoved = true;
    }

    els.creditsGroup.hidden = !hasCredits;
    els.projectCredits.innerHTML = hasCredits
      ? `
      <ul class="credits-list">
        ${project.credits.map((credit) => `<li>${credit}</li>`).join("")}
      </ul>
    `
      : "";

    // Create mobile footer elements for non-full-page projects (includes chapter pages)
    if (window.innerWidth <= 640 && !isFullPage) {
      createMobileProjectFooter(project);
    }

    // Create mobile footer and setup autoplay for full-page projects
    if (window.innerWidth <= 640 && isFullPage) {
      createMobileFullPageProjectFooter(project);
      setupFullPageMobileAutoplay();
    }
  }

  function setupFullPageMobileAutoplay() {
    const videoShells = Array.from(els.projectVideoGrid.querySelectorAll(".video-shell"));
    const isIPhone = isIPhoneDevice();
    let currentVideoIndex = 0;
    
    // Create a map of shells to their video info
    const videosMap = new Map();

    videoShells.forEach((shell, index) => {
      const frame = shell.querySelector("iframe");
      if (frame) {
        // Get the corresponding controller if it exists
        const controller = state.customVideoControllers[index] || null;
        videosMap.set(shell, { frame, controller, index });
      }
    });

    const existingFixedMuteButton = els.projectOverlay.querySelector(".fullpage-mobile-mute-toggle");
    if (existingFixedMuteButton) existingFixedMuteButton.remove();

    const fixedMuteButton = document.createElement("button");
    fixedMuteButton.type = "button";
    fixedMuteButton.className = "fullpage-mobile-mute-toggle";
    fixedMuteButton.textContent = "mute";
    fixedMuteButton.setAttribute("aria-label", "Mute video");
    els.projectOverlay.appendChild(fixedMuteButton);

    const existingSwipeHint = els.projectOverlay.querySelector(".fullpage-mobile-swipe-hint");
    if (existingSwipeHint) existingSwipeHint.remove();

    const swipeHint = document.createElement("div");
    swipeHint.className = "fullpage-mobile-swipe-hint";
    swipeHint.textContent = "↓ swipe for more ↓";
    els.projectOverlay.appendChild(swipeHint);

    let fixedMuteUnsubscribe = null;
    let swipeHintTimer = null;

    const hideSwipeHint = () => {
      swipeHint.classList.remove("is-visible");
    };

    const scheduleSwipeHint = () => {
      window.clearTimeout(swipeHintTimer);
      swipeHintTimer = window.setTimeout(() => {
        swipeHint.classList.add("is-visible");
      }, 5000);
    };

    const setFixedMuteLabel = (isMuted) => {
      fixedMuteButton.textContent = isMuted ? "unmute" : "mute";
      fixedMuteButton.setAttribute("aria-label", isMuted ? "Unmute video" : "Mute video");
    };

    const bindFixedMuteToIndex = (index) => {
      if (fixedMuteUnsubscribe) {
        fixedMuteUnsubscribe();
        fixedMuteUnsubscribe = null;
      }

      const shell = videoShells[index];
      const info = shell ? videosMap.get(shell) : null;
      const controller = info?.controller;
      const hasMuteControl = controller
        && typeof controller.setMuted === "function"
        && typeof controller.isMuted === "function";

      fixedMuteButton.disabled = !hasMuteControl;
      fixedMuteButton.classList.toggle("is-disabled", !hasMuteControl);

      if (!hasMuteControl) {
        setFixedMuteLabel(false);
        return;
      }

      setFixedMuteLabel(controller.isMuted());
      if (typeof controller.onMuteChange === "function") {
        fixedMuteUnsubscribe = controller.onMuteChange((muted) => {
          setFixedMuteLabel(Boolean(muted));
        });
      }
    };

    const bindSwipeHintToIndex = (index) => {
      window.clearTimeout(swipeHintTimer);
      hideSwipeHint();

      if (index >= videoShells.length - 1) {
        return;
      }

      scheduleSwipeHint();
    };

    const playVideoAtIndex = (index) => {
      const current = videoShells[index];
      const currentInfo = current ? videosMap.get(current) : null;
      if (!currentInfo) return;

      currentVideoIndex = index;
      bindFixedMuteToIndex(index);
      bindSwipeHintToIndex(index);

      if (currentInfo.controller && typeof currentInfo.controller.play === "function") {
        currentInfo.controller.play();
      }

      videosMap.forEach((otherInfo) => {
        if (otherInfo.index !== index && otherInfo.controller && typeof otherInfo.controller.pause === "function") {
          otherInfo.controller.pause();
        }
      });
    };

    // Create intersection observer to autoplay/pause videos based on visibility
    const observerOptions = {
      root: els.projectOverlay,
      threshold: [0.75] // Video must be 75% visible to play
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const shell = entry.target;
        const videoInfo = videosMap.get(shell);
        if (!videoInfo) return;

        const { controller, index } = videoInfo;
        
        if (entry.isIntersecting && entry.intersectionRatio >= 0.75) {
          if (isIPhone) {
            // On iPhone, avoid non-gesture autoplay attempts here because they can
            // leave Vimeo/YouTube showing a misleading loading state. Actual play
            // is triggered from the swipe gesture path instead.
            currentVideoIndex = index;
            bindFixedMuteToIndex(index);
            bindSwipeHintToIndex(index);
          } else {
            // Video is 75%+ in view - play this one and pause others.
            playVideoAtIndex(index);
          }
        } else if (entry.intersectionRatio < 0.75) {
          // Video is not 75% visible - pause it
          if (controller && typeof controller.pause === "function") {
            controller.pause();
          }
        }
      });
    }, observerOptions);

    // Observe all video shells
    videoShells.forEach((shell) => {
      observer.observe(shell);
    });

    // Setup strict gesture paging: each swipe/scroll moves exactly one video.
    let isSnapAnimating = false;
    let touchStartY = null;
    let touchGestureConsumed = false;
    let wheelBurstLocked = false;
    let wheelUnlockTimer = null;
    let pendingStep = 0;
    const SWIPE_THRESHOLD = 24;
    const SCROLL_THRESHOLD = 12;

    const snapToVideo = (index) => {
      if (index < 0 || index >= videoShells.length || isSnapAnimating) return;
      
      isSnapAnimating = true;
      currentVideoIndex = index;
      
      const shellElement = videoShells[index];
      const targetScrollTop = shellElement.offsetTop;

      els.projectOverlay.scrollTo({
        top: targetScrollTop,
        behavior: "smooth"
      });

      // Reset animation flag after the smooth snap settles.
      setTimeout(() => {
        isSnapAnimating = false;
        if (pendingStep !== 0) {
          const queuedStep = pendingStep;
          pendingStep = 0;
          navigateByStep(queuedStep);
        }
      }, 520);
    };

    const canNavigate = () => {
      if (isSnapAnimating) return false;
      return true;
    };

    const navigateByStep = (step) => {
      if (!step) return;
      if (!canNavigate()) {
        pendingStep = step > 0 ? 1 : -1;
        return;
      }
      const targetIndex = Math.max(0, Math.min(videoShells.length - 1, currentVideoIndex + step));
      if (targetIndex === currentVideoIndex) return;

      // On iPhone, fire play directly during the swipe gesture.
      if (isIPhone) {
        playVideoAtIndex(targetIndex);
      }

      snapToVideo(targetIndex);
    };

    const onWheel = (event) => {
      event.preventDefault();
      // Treat continuous wheel momentum as one burst: first qualifying delta wins.
      if (wheelBurstLocked) {
        window.clearTimeout(wheelUnlockTimer);
        wheelUnlockTimer = window.setTimeout(() => {
          wheelBurstLocked = false;
        }, 220);
        return;
      }
      if (Math.abs(event.deltaY) < SCROLL_THRESHOLD) return;
      wheelBurstLocked = true;
      window.clearTimeout(wheelUnlockTimer);
      wheelUnlockTimer = window.setTimeout(() => {
        wheelBurstLocked = false;
      }, 220);
      navigateByStep(event.deltaY > 0 ? 1 : -1);
    };

    const onTouchStart = (event) => {
      if (!event.touches || event.touches.length !== 1) return;
      touchStartY = event.touches[0].clientY;
      touchGestureConsumed = false;
    };

    const onTouchMove = (event) => {
      // Prevent native inertial scrolling from skipping multiple videos.
      event.preventDefault();
    };

    const onTouchEnd = (event) => {
      if (touchStartY === null) return;
      if (touchGestureConsumed) {
        touchStartY = null;
        return;
      }
      const endY = event.changedTouches?.[0]?.clientY;
      if (typeof endY !== "number") {
        touchStartY = null;
        return;
      }

      const deltaY = touchStartY - endY;
      touchStartY = null;

      if (Math.abs(deltaY) < SWIPE_THRESHOLD) return;
      touchGestureConsumed = true;
      navigateByStep(deltaY > 0 ? 1 : -1);
    };

    const onTouchCancel = () => {
      touchStartY = null;
      touchGestureConsumed = false;
    };

    fixedMuteButton.addEventListener("click", (event) => {
      event.preventDefault();
      const shell = videoShells[currentVideoIndex];
      const info = shell ? videosMap.get(shell) : null;
      const controller = info?.controller;
      if (!controller || typeof controller.setMuted !== "function" || typeof controller.isMuted !== "function") {
        return;
      }
      controller.setMuted(!controller.isMuted());
    });

    els.projectOverlay.addEventListener("wheel", onWheel, { passive: false });
    els.projectOverlay.addEventListener("touchstart", onTouchStart, { passive: true });
    els.projectOverlay.addEventListener("touchmove", onTouchMove, { passive: false });
    els.projectOverlay.addEventListener("touchend", onTouchEnd, { passive: true });
    els.projectOverlay.addEventListener("touchcancel", onTouchCancel, { passive: true });

    // Initial snap to first video
    setTimeout(() => {
      snapToVideo(0);
    }, 100);
    bindFixedMuteToIndex(0);
    bindSwipeHintToIndex(0);

    // Store cleanup callback and observer for overlay close.
    state.fullPageAutoplayObserver = observer;
    state.fullPageVideosMap = videosMap;
    state.fullPageScrollHandler = () => {
      if (fixedMuteUnsubscribe) {
        fixedMuteUnsubscribe();
        fixedMuteUnsubscribe = null;
      }
      window.clearTimeout(swipeHintTimer);
      fixedMuteButton.remove();
      swipeHint.remove();
      window.clearTimeout(wheelUnlockTimer);
      els.projectOverlay.removeEventListener("wheel", onWheel);
      els.projectOverlay.removeEventListener("touchstart", onTouchStart);
      els.projectOverlay.removeEventListener("touchmove", onTouchMove);
      els.projectOverlay.removeEventListener("touchend", onTouchEnd);
      els.projectOverlay.removeEventListener("touchcancel", onTouchCancel);
    };
  }

  function createMobileFullPageProjectFooter(project) {
    // Remove existing footer elements if they exist
    const existingFooterLeft = els.projectOverlay.querySelector(".project-footer-left");
    if (existingFooterLeft) existingFooterLeft.remove();

    // Create footer-left with title and type (no see-more button for full-page)
    const footerLeft = document.createElement("div");
    footerLeft.className = "project-footer-left";
    footerLeft.innerHTML = `
      <p id="project-type-footer" class="eyebrow">${project.type}</p>
      <h2 id="project-title-footer">${project.title}</h2>
    `;

    // Append to overlay (not panel) so position:fixed works correctly
    els.projectOverlay.appendChild(footerLeft);
  }

  function detectVideoProvider(url) {
    if (url.includes("vimeo.com")) return "vimeo";
    if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
    return null;
  }

  function createMobileProjectFooter(project) {
    // Remove existing footer elements if they exist
    let existingFooterLeft = els.projectPanel.querySelector(".project-footer-left");
    if (!existingFooterLeft) existingFooterLeft = els.projectOverlay.querySelector(".project-footer-left");
    let existingSeeMore = els.projectPanel.querySelector(".project-see-more");
    if (!existingSeeMore) existingSeeMore = els.projectOverlay.querySelector(".project-see-more");
    if (existingFooterLeft) existingFooterLeft.remove();
    if (existingSeeMore) existingSeeMore.remove();

    // Create footer-left with title and type
    const footerLeft = document.createElement("div");
    footerLeft.className = "project-footer-left";
    footerLeft.innerHTML = `
      <p id="project-type-footer" class="eyebrow">${project.type}</p>
      <h2 id="project-title-footer">${project.title}</h2>
    `;

    // Create see-more button
    const seeMoreBtn = document.createElement("button");
    seeMoreBtn.className = "project-see-more";
    seeMoreBtn.type = "button";
    seeMoreBtn.textContent = "see more";
    const arrow = document.createElement("span");
    arrow.textContent = " ↓";
    seeMoreBtn.appendChild(arrow);
    const revealProjectDetails = () => {
      if (els.projectMeta.classList.contains("is-visible")) return;

      // Reveal the project details section on mobile.
      const hasVisibleStills = !els.projectStillsShell.hidden;
      els.projectStillsShell.classList.toggle("is-visible", hasVisibleStills);
      els.projectMeta.classList.add("is-visible");

      // Hide footer buttons after scrolling
      footerLeft.style.display = "none";
      seeMoreBtn.style.display = "none";

      const scrollTarget = hasVisibleStills ? els.projectStillsShell : els.projectMeta;
      requestAnimationFrame(() => {
        const overlayTop = els.projectOverlay.getBoundingClientRect().top;
        const targetTop = scrollTarget.getBoundingClientRect().top - overlayTop + els.projectOverlay.scrollTop;
        els.projectOverlay.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
      });
    };

    seeMoreBtn.addEventListener("click", revealProjectDetails);

    // Add click handler to project-meta to go back
    const closeMetaHandler = () => {
      els.projectMeta.classList.remove("is-visible");
      els.projectStillsShell.classList.remove("is-visible");
      footerLeft.style.display = "block";
      seeMoreBtn.style.display = "block";
      els.projectOverlay.scrollTo({ top: 0, behavior: "smooth" });
    };

    // Add close button or allow clicking outside
    const projectMetaTopElement = els.projectMeta.querySelector(".project-meta-top");
    if (projectMetaTopElement && !els.projectMeta.querySelector(".close-meta")) {
      const closeMetaBtn = document.createElement("button");
      closeMetaBtn.className = "close-meta";
      closeMetaBtn.type = "button";
      closeMetaBtn.textContent = "↑ back";
      closeMetaBtn.addEventListener("click", closeMetaHandler);
      els.projectMeta.appendChild(closeMetaBtn);
    }

    // Store the handler for cleanup
    state.closeMetaHandler = closeMetaHandler;

    // Allow a downward wheel/swipe to trigger the same behavior as pressing "see more".
    let touchStartY = null;
    const onOverlayWheel = (event) => {
      const detailsVisible = els.projectMeta.classList.contains("is-visible");

      if (!detailsVisible && event.deltaY > 10) {
        event.preventDefault();
        revealProjectDetails();
        return;
      }

      if (detailsVisible && event.deltaY < -10) {
        event.preventDefault();
        closeMetaHandler();
      }
    };

    const onOverlayTouchStart = (event) => {
      if (!event.touches || event.touches.length !== 1) return;
      touchStartY = event.touches[0].clientY;
    };

    const onOverlayTouchEnd = (event) => {
      if (touchStartY === null) return;
      const endY = event.changedTouches?.[0]?.clientY;
      if (typeof endY !== "number") {
        touchStartY = null;
        return;
      }

      const deltaY = touchStartY - endY;
      touchStartY = null;

      const detailsVisible = els.projectMeta.classList.contains("is-visible");
      if (!detailsVisible && deltaY > 24) {
        revealProjectDetails();
      } else if (detailsVisible && deltaY < -24) {
        closeMetaHandler();
      }
    };

    els.projectOverlay.addEventListener("wheel", onOverlayWheel, { passive: false });
    els.projectOverlay.addEventListener("touchstart", onOverlayTouchStart, { passive: true });
    els.projectOverlay.addEventListener("touchend", onOverlayTouchEnd, { passive: true });

    state.projectSeeMoreGestureCleanup = () => {
      els.projectOverlay.removeEventListener("wheel", onOverlayWheel);
      els.projectOverlay.removeEventListener("touchstart", onOverlayTouchStart);
      els.projectOverlay.removeEventListener("touchend", onOverlayTouchEnd);
    };

    // Append to overlay (not panel) so position:fixed remains reliable on iOS Safari
    els.projectOverlay.appendChild(footerLeft);
    els.projectOverlay.appendChild(seeMoreBtn);
  }

  function renderProjectStillsPage(project) {
    const stills = Array.isArray(project.stills) ? project.stills : [];
    const totalStills = stills.length;
    const perPage = state.projectStillsPerPage;
    const totalPages = Math.max(1, totalStills - perPage + 1);
    state.projectStillsPage = 0;

    if (state.stillsScrollHandler) {
      els.projectStillsGrid.removeEventListener("scroll", state.stillsScrollHandler);
      state.stillsScrollHandler = null;
    }
    els.projectStillsGrid.innerHTML = "";

    const appendStill = (src, index) => {
      const img = document.createElement("img");
      img.className = "stills-item";
      setStillImageSource(img, src);
      img.alt = `${project.title} still ${index + 1}`;
      img.loading = "lazy";
      img.decoding = "async";
      img.addEventListener("click", () => {
        openProjectStillViewer(src, img.alt);
      });
      els.projectStillsGrid.appendChild(img);
    };

    stills.forEach((src, index) => appendStill(src, index));

    if (!els.projectStillsDots) return;
    els.projectStillsDots.innerHTML = "";
    els.projectStillsDots.hidden = totalStills <= perPage;

    if (totalStills > perPage) {
      const dots = [];
      const ITEM_GAP = 14;

      const getMetrics = () => {
        const width = els.projectStillsGrid.clientWidth || els.projectStillsGrid.offsetWidth || 1;
        const itemWidth = (width - ITEM_GAP * (perPage - 1)) / perPage;
        return { step: itemWidth + ITEM_GAP, loopStart: totalStills * (itemWidth + ITEM_GAP) };
      };

      for (let i = 0; i < totalPages; i++) {
        const dot = document.createElement("button");
        dot.type = "button";
        dot.className = "stills-dot" + (i === 0 ? " is-active" : "");
        dot.setAttribute("aria-label", `Go to still ${i + 1}`);
        dot.addEventListener("click", () => {
          const { step } = getMetrics();
          els.projectStillsGrid.scrollTo({ left: step * i, behavior: "auto" });
        });
        els.projectStillsDots.appendChild(dot);
        dots.push(dot);
      }

      const onScroll = () => {
        const { step } = getMetrics();
        if (!step) return;
        const raw = Math.round(els.projectStillsGrid.scrollLeft / step);
        state.projectStillsPage = Math.max(0, Math.min(raw, totalPages - 1));
        dots.forEach((d, i) => d.classList.toggle("is-active", i === state.projectStillsPage));
      };

      state.stillsScrollHandler = onScroll;
      els.projectStillsGrid.addEventListener("scroll", onScroll, { passive: true });
    }
  }

  function normalizeEmbedUrl(url, options = {}) {
    if (!url) return "";
    // Data strings can contain HTML-escaped query separators from copied embed snippets.
    const normalized = String(url).replaceAll("&amp;", "&");

    try {
      const parsed = new URL(normalized, window.location.href);
      const host = parsed.hostname.toLowerCase();

      if (host.includes("vimeo.com")) {
        if (options.customUI) {
          parsed.searchParams.set("title", "0");
          parsed.searchParams.set("byline", "0");
          parsed.searchParams.set("portrait", "0");
          parsed.searchParams.set("badge", "0");
          parsed.searchParams.set("controls", "0");
          parsed.searchParams.set("playsinline", "1");
          if (options.autoplay) {
            parsed.searchParams.set("autoplay", "1");
            // Force muted=1 on mobile so iOS allows autoplay
            const mutedForIos = options.muted === false && window.innerWidth > 860 ? "0" : "1";
            parsed.searchParams.set("muted", mutedForIos);
            parsed.searchParams.set("autopause", "0");
          } else {
            parsed.searchParams.set("autoplay", "0");
            // Explicitly clear muted so source URLs with muted=1 don't prevent audio on iOS tap-to-play
            parsed.searchParams.set("muted", "0");
            parsed.searchParams.delete("background");
          }
        } else {
          const isMobileEmbed = window.innerWidth <= 860;
          // On desktop use background=1 for muted-autoplay (suppresses Vimeo's "Activate sound" prompt).
          // On mobile avoid background=1 because it also forces looping; use explicit muted param instead.
          const useBackground = options.autoplay && options.muted !== false && !isMobileEmbed;
          if (useBackground) {
            parsed.searchParams.set("background", "1");
          } else {
            parsed.searchParams.set("title", "0");
            parsed.searchParams.set("byline", "0");
            parsed.searchParams.set("portrait", "0");
            parsed.searchParams.set("badge", "0");
            // suppress native controls when we add our own; keep them for regular (non-chapter) videos
            parsed.searchParams.set(
              "controls",
              options.autoplay || options.customUI || options.suppressNativeControls ? "0" : "1"
            );
            parsed.searchParams.set("playsinline", "1");
            if (options.autoplay) {
              parsed.searchParams.set("autoplay", "1");
              // Force muted=1 on mobile so iOS allows autoplay; desktop keeps requested muted value
              const mutedValue = (options.muted !== false || isMobileEmbed) ? "1" : "0";
              parsed.searchParams.set("muted", mutedValue);
              parsed.searchParams.set("autopause", "0");
            } else {
              parsed.searchParams.set("autoplay", "0");
              parsed.searchParams.delete("background");
            }
          }
        }
      }

      if (host.includes("youtube.com") || host.includes("youtu.be")) {
        parsed.searchParams.set("controls", options.customUI ? "0" : "1");
        parsed.searchParams.set("modestbranding", "1");
        parsed.searchParams.set("rel", "0");
        parsed.searchParams.set("playsinline", "1");
        parsed.searchParams.set("fs", "0");
        parsed.searchParams.set("iv_load_policy", "3");
        parsed.searchParams.set("enablejsapi", "1");
        parsed.searchParams.set("origin", window.location.origin);
        if (options.autoplay) {
          parsed.searchParams.set("autoplay", "1");
          // Force mute=1 on mobile so iOS allows autoplay
          const muteForIos = options.muted === false && window.innerWidth > 860 ? "0" : "1";
          parsed.searchParams.set("mute", muteForIos);
          parsed.searchParams.set("muted", muteForIos);
          parsed.searchParams.set("loop", "1");
        } else {
          parsed.searchParams.set("autoplay", "0");
          parsed.searchParams.set("loop", "0");
        }
      }

      return parsed.toString();
    } catch {
      return normalized;
    }
  }

  function detectVideoProvider(url) {
    if (!url) return null;

    try {
      const parsed = new URL(String(url).replaceAll("&amp;", "&"), window.location.href);
      const host = parsed.hostname.toLowerCase();
      if (host.includes("vimeo.com")) return "vimeo";
      if (host.includes("youtube.com") || host.includes("youtu.be")) return "youtube";
      return null;
    } catch {
      return null;
    }
  }

  function createStandardVideoControls({ shell, ratio, frame, provider, autoPlay = false, startMuted = false, forceUnmutedOnFirstPlay }) {
    const shouldForceUnmutedOnFirstPlay = forceUnmutedOnFirstPlay ?? (isIPhoneDevice() && window.innerWidth <= 860);

    if (provider === "vimeo" && typeof Vimeo !== "undefined") {
      const player = new Vimeo.Player(frame);
      return attachCustomControls({
        shell,
        ratio,
        buildAdapter: () => buildVimeoAdapter(player),
        autoPlay,
        startMuted,
        forceUnmutedOnFirstPlay: shouldForceUnmutedOnFirstPlay
      });
    }

    if (provider === "youtube") {
      return attachCustomControls({
        shell,
        ratio,
        autoPlay,
        startMuted,
        forceUnmutedOnFirstPlay: shouldForceUnmutedOnFirstPlay,
        buildAdapter: async () => {
          const yt = await ensureYouTubeApi();
          return buildYouTubeAdapter(frame, yt);
        }
      });
    }

    return null;
  }

  function attachCustomControls({ shell, ratio, buildAdapter, autoPlay = false, startMuted = false, forceUnmutedOnFirstPlay = false }) {
    const uiLayer = document.createElement("div");
    uiLayer.className = "video-ui-layer";

    const hitArea = document.createElement("button");
    hitArea.type = "button";
    hitArea.className = "video-hit-area";
    hitArea.setAttribute("aria-label", "Toggle play or pause");

    const controls = document.createElement("div");
    controls.className = "video-controls";

    const playBtn = document.createElement("button");
    playBtn.type = "button";
    playBtn.className = "video-control-btn video-play-ctrl-center";
    playBtn.setAttribute("aria-label", "Play video");
    
    // Use play icon on mobile, text on desktop
    if (window.matchMedia("(max-width: 860px)").matches) {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("width", "20");
      svg.setAttribute("height", "20");
      svg.setAttribute("fill", "currentColor");
      svg.classList.add("video-play-icon");
      
      const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      polygon.setAttribute("points", "5,3 5,21 19,12");
      svg.appendChild(polygon);
      playBtn.appendChild(svg);
    } else {
      playBtn.textContent = "play";
    }

    const muteBtn = document.createElement("button");
    muteBtn.type = "button";
    muteBtn.className = "video-control-btn video-mute-ctrl";
    muteBtn.textContent = "mute";
    muteBtn.setAttribute("aria-label", "Mute video");

    const muteBtnWrapper = document.createElement("div");
    muteBtnWrapper.className = "video-mute-wrapper";
    muteBtnWrapper.appendChild(muteBtn);
    muteBtnWrapper.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });
    muteBtnWrapper.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    const timeline = document.createElement("input");
    timeline.type = "range";
    timeline.className = "video-timeline";
    timeline.min = "0";
    timeline.max = "1000";
    timeline.value = "0";
    timeline.setAttribute("aria-label", "Video timeline");

    controls.appendChild(timeline);
    controls.appendChild(muteBtn);

    const applyMutePlacement = () => {
      const isMobileVideoLayout = window.matchMedia("(max-width: 860px)").matches;
      const panelContext = ratio.closest(".project-panel") || shell.closest(".project-panel") || els.projectPanel;
      const isChapterOrFullLayout = panelContext
        ? panelContext.classList.contains("is-full-page") || panelContext.classList.contains("is-chapter-page")
        : false;
      const isCurrentProjectChapterOrFull = Boolean(
        state.currentProject && (state.currentProject.fullPage || state.currentProject.chapterPage)
      );
      const overlayFlagsChapterOrFull = Boolean(
        els.projectOverlay?.classList.contains("is-full-page-project") ||
        els.projectOverlay?.classList.contains("is-chapter-page-project")
      );
      const useDetachedMobileMute = isMobileVideoLayout && !isChapterOrFullLayout;
      const shouldDetachMute = useDetachedMobileMute && !overlayFlagsChapterOrFull && !isCurrentProjectChapterOrFull;

      if (shouldDetachMute) {
        if (controls.contains(muteBtn)) controls.removeChild(muteBtn);
        if (!muteBtnWrapper.contains(muteBtn)) muteBtnWrapper.appendChild(muteBtn);
        if (!muteBtnWrapper.isConnected) ratio.appendChild(muteBtnWrapper);
      } else {
        if (muteBtnWrapper.contains(muteBtn)) muteBtnWrapper.removeChild(muteBtn);
        if (muteBtnWrapper.isConnected) muteBtnWrapper.remove();
        if (!controls.contains(muteBtn)) controls.appendChild(muteBtn);
      }
    };

    uiLayer.appendChild(hitArea);
    uiLayer.appendChild(playBtn);
    uiLayer.appendChild(controls);
    ratio.appendChild(uiLayer);
    applyMutePlacement();
    window.requestAnimationFrame(applyMutePlacement);
    const placementRetryTimers = [
      window.setTimeout(applyMutePlacement, 120),
      window.setTimeout(applyMutePlacement, 300),
      window.setTimeout(applyMutePlacement, 700)
    ];

    const ui = {
      duration: 0,
      paused: true,
      muted: false,
      scrubbing: false,
      alive: true,
      adapter: null,
      muteListeners: new Set(),
      pauseListeners: new Set()
    };

    let hideControlsTimer = null;

    const showControls = () => {
      ratio.classList.add("controls-active");
      window.clearTimeout(hideControlsTimer);
      hideControlsTimer = null;
      if (!ui.paused && !ui.scrubbing) {
        hideControlsTimer = window.setTimeout(() => {
          if (!ui.paused && !ui.scrubbing) {
            ratio.classList.remove("controls-active");
          }
        }, 2000);
      }
    };

    const cancelHideControls = () => {
      window.clearTimeout(hideControlsTimer);
      hideControlsTimer = null;
    };

    const hideControlsNow = () => {
      if (!ui.paused && !ui.scrubbing) {
        cancelHideControls();
        ratio.classList.remove("controls-active");
      }
    };

    uiLayer.addEventListener("pointerenter", showControls);
    uiLayer.addEventListener("pointermove", (event) => {
      // On touch, pointermove fires continuously and would keep resetting the timer.
      // Only mouse movement should reset the auto-hide countdown.
      if (event.pointerType === "mouse") showControls();
    });
    uiLayer.addEventListener("pointerdown", showControls);
    uiLayer.addEventListener("pointerleave", (event) => {
      if (event.pointerType === "mouse") hideControlsNow();
    });

    const setTimelineRatio = (ratio) => {
      const safe = Math.max(0, Math.min(Number.isFinite(ratio) ? ratio : 0, 1));
      const value = String(Math.round(safe * 1000));
      timeline.value = value;
      timeline.style.setProperty("--progress", `${safe * 100}%`);
    };

    const updatePlayUi = () => {
      playBtn.textContent = ui.paused ? "play" : "pause";
      playBtn.setAttribute("aria-label", ui.paused ? "Play video" : "Pause video");
      ratio.classList.toggle("is-paused", ui.paused);
    };

    const updateMuteUi = () => {
      muteBtn.textContent = ui.muted ? "unmute" : "mute";
      muteBtn.setAttribute("aria-label", ui.muted ? "Unmute video" : "Mute video");
    };

    const notifyMuteListeners = () => {
      ui.muteListeners.forEach((listener) => {
        try {
          listener(ui.muted);
        } catch (_) {
          // Ignore listener errors.
        }
      });
    };

    const notifyPauseListeners = () => {
      ui.pauseListeners.forEach((listener) => {
        try {
          listener(ui.paused);
        } catch (_) {
          // Ignore listener errors.
        }
      });
    };

    const destroy = () => {
      ui.alive = false;
      cancelHideControls();
      placementRetryTimers.forEach((timerId) => window.clearTimeout(timerId));
      ui.muteListeners.clear();
      ui.pauseListeners.clear();
      if (ui.adapter && typeof ui.adapter.destroy === "function") {
        ui.adapter.destroy();
      }
      uiLayer.remove();
    };

    Promise.resolve(buildAdapter()).then((adapter) => {
      if (!ui.alive) {
        if (adapter && typeof adapter.destroy === "function") {
          adapter.destroy();
        }
        return;
      }

      ui.adapter = adapter;
      ui.duration = adapter.duration || 0;
      ui.paused = adapter.paused !== false;
      ui.muted = adapter.muted === true;
      updatePlayUi();
      updateMuteUi();
      setTimelineRatio(0);

      if (autoPlay) {
        adapter.setMuted(Boolean(startMuted));
        ui.muted = Boolean(startMuted);
        updateMuteUi();
        notifyMuteListeners();
        adapter.play();
      }

      adapter.onState((nextState) => {
        if (!ui.alive) return;
        if (typeof nextState.paused === "boolean") {
          const wasPlaying = !ui.paused;
          const nowPlaying = !nextState.paused;
          ui.paused = nextState.paused;
          updatePlayUi();
          notifyPauseListeners();
          // Only trigger show/hide on actual paused-state transitions, not on
          // every timeupdate tick (which also carries paused in the state object).
          if (!wasPlaying && nowPlaying) {
            showControls();
          } else if (wasPlaying && !nowPlaying) {
            cancelHideControls();
          }
        }
        if (typeof nextState.muted === "boolean") {
          ui.muted = nextState.muted;
          updateMuteUi();
          notifyMuteListeners();
        }
        if (typeof nextState.duration === "number" && nextState.duration > 0) {
          ui.duration = nextState.duration;
        }
        if (!ui.scrubbing && typeof nextState.currentTime === "number" && ui.duration > 0) {
          setTimelineRatio(nextState.currentTime / ui.duration);
        }
      });

      const playFromGesture = () => {
        if (!ui.adapter) return;
        if (!ui.paused) {
          ui.adapter.pause();
          return;
        }

        if (forceUnmutedOnFirstPlay) {
          Promise.resolve(ui.adapter.setMuted(false)).catch(() => {}).finally(() => {
            ui.muted = false;
            updateMuteUi();
            ui.adapter.play();
          });
          return;
        }

        ui.adapter.play();
      };

      playBtn.addEventListener("click", playFromGesture);

      hitArea.addEventListener("click", (event) => {
        event.preventDefault();
        playFromGesture();
      });

      muteBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!ui.adapter) return;
        ui.adapter.setMuted(!ui.muted);
      });

      const seekFromTimeline = () => {
        if (!ui.adapter || ui.duration <= 0) return;
        const ratio = Number(timeline.value) / 1000;
        ui.adapter.seek(ui.duration * ratio);
      };

      timeline.addEventListener("pointerdown", () => {
        ui.scrubbing = true;
        cancelHideControls();
      });

      timeline.addEventListener("input", () => {
        const ratio = Number(timeline.value) / 1000;
        setTimelineRatio(ratio);
      });

      timeline.addEventListener("change", () => {
        seekFromTimeline();
        ui.scrubbing = false;
      });

      timeline.addEventListener("pointerup", () => {
        seekFromTimeline();
        ui.scrubbing = false;
      });
    }).catch(() => {
      destroy();
    });

    return { 
      destroy,
      play: () => {
        if (ui.adapter && ui.paused) {
          ui.adapter.play();
        }
      },
      pause: () => {
        if (ui.adapter && !ui.paused) {
          ui.adapter.pause();
        }
      },
      setMuted: (nextMuted) => {
        if (!ui.adapter) return;
        ui.adapter.setMuted(Boolean(nextMuted));
      },
      isMuted: () => Boolean(ui.muted),
      onMuteChange: (listener) => {
        if (typeof listener !== "function") {
          return () => {};
        }
        ui.muteListeners.add(listener);
        listener(ui.muted);
        return () => {
          ui.muteListeners.delete(listener);
        };
      },
      isPaused: () => Boolean(ui.paused),
      onPauseChange: (listener) => {
        if (typeof listener !== "function") {
          return () => {};
        }
        ui.pauseListeners.add(listener);
        listener(ui.paused);
        return () => {
          ui.pauseListeners.delete(listener);
        };
      }
    };
  }

  function buildVimeoAdapter(player) {
    const listeners = [];
    const state = {
      paused: true,
      muted: false,
      duration: 0,
      currentTime: 0
    };

    const emit = () => {
      listeners.forEach((listener) => listener({ ...state }));
    };

    player.getDuration().then((duration) => {
      state.duration = Number(duration) || 0;
      emit();
    }).catch(() => {});

    player.getPaused().then((paused) => {
      state.paused = paused !== false;
      emit();
    }).catch(() => {});

    player.getMuted().then((muted) => {
      state.muted = muted === true;
      emit();
    }).catch(() => {});

    player.on("play", () => {
      state.paused = false;
      emit();
    });

    player.on("pause", () => {
      state.paused = true;
      emit();
    });

    player.on("timeupdate", ({ seconds, duration }) => {
      state.currentTime = Number(seconds) || 0;
      if (Number.isFinite(duration) && duration > 0) {
        state.duration = duration;
      }
      emit();
    });

    player.on("volumechange", ({ muted }) => {
      state.muted = muted === true;
      emit();
    });

    return {
      get duration() {
        return state.duration;
      },
      get paused() {
        return state.paused;
      },
      get muted() {
        return state.muted;
      },
      onState(listener) {
        listeners.push(listener);
      },
      play() {
        player.play().catch(() => {});
      },
      pause() {
        player.pause().catch(() => {});
      },
      setMuted(next) {
        return player.setMuted(Boolean(next)).catch(() => {});
      },
      seek(seconds) {
        player.setCurrentTime(seconds).catch(() => {});
      },
      destroy() {
        player.destroy().catch(() => {});
      }
    };
  }

  function ensureYouTubeApi() {
    if (window.YT && typeof window.YT.Player === "function") {
      return Promise.resolve(window.YT);
    }

    if (youTubeApiPromise) return youTubeApiPromise;

    youTubeApiPromise = new Promise((resolve) => {
      const existing = document.querySelector("script[src='https://www.youtube.com/iframe_api']");
      if (!existing) {
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(script);
      }

      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof previous === "function") {
          previous();
        }
        resolve(window.YT);
      };
    });

    return youTubeApiPromise;
  }

  function buildYouTubeAdapter(frame, yt) {
    const listeners = [];
    const state = {
      paused: true,
      muted: false,
      duration: 0,
      currentTime: 0
    };

    const emit = () => {
      listeners.forEach((listener) => listener({ ...state }));
    };

    let pollTimer = null;
    const stopPolling = () => {
      if (!pollTimer) return;
      window.clearInterval(pollTimer);
      pollTimer = null;
    };

    const startPolling = (player) => {
      stopPolling();
      pollTimer = window.setInterval(() => {
        state.currentTime = Number(player.getCurrentTime?.() || 0);
        const duration = Number(player.getDuration?.() || 0);
        if (duration > 0) state.duration = duration;
        state.muted = Boolean(player.isMuted?.());
        emit();
      }, 250);
    };

    const player = new yt.Player(frame, {
      playerVars: {
        autoplay: 1,
        controls: 0,
        disablekb: 1,
        fs: 0,
        iv_load_policy: 3,
        modestbranding: 1,
        playsinline: 1,
        rel: 0
      },
      events: {
        onReady: (event) => {
          state.duration = Number(event.target.getDuration?.() || 0);
          state.muted = Boolean(event.target.isMuted?.());
          state.paused = true;
          emit();
          startPolling(event.target);
        },
        onStateChange: (event) => {
          state.paused = event.data !== yt.PlayerState.PLAYING;
          emit();
        }
      }
    });

    return {
      get duration() {
        return state.duration;
      },
      get paused() {
        return state.paused;
      },
      get muted() {
        return state.muted;
      },
      onState(listener) {
        listeners.push(listener);
      },
      play() {
        player.playVideo?.();
      },
      pause() {
        player.pauseVideo?.();
      },
      setMuted(next) {
        if (next) {
          player.mute?.();
        } else {
          player.unMute?.();
        }
        state.muted = Boolean(next);
        emit();
      },
      seek(seconds) {
        player.seekTo?.(seconds, true);
      },
      destroy() {
        stopPolling();
        player.destroy?.();
      }
    };
  }

  function getVideoOrientations(project, count) {
    const defaults = Array.from({ length: count }, () => "horizontal");
    if (!Array.isArray(project.videoOrientation)) return defaults;

    return defaults.map((fallback, index) => {
      const raw = String(project.videoOrientation[index] || "").trim().toLowerCase();
      if (raw.startsWith("v")) return "vertical";
      if (raw.startsWith("h")) return "horizontal";
      return fallback;
    });
  }

  function getVideoAspectRatios(project, count, orientations) {
    const fallbackFromOrientation = Array.from({ length: count }, (_, index) =>
      orientations[index] === "vertical" ? "9 / 16" : "16 / 9"
    );

    if (!Array.isArray(project.videoAspectRatios)) return fallbackFromOrientation;

    return fallbackFromOrientation.map((fallback, index) => {
      const value = project.videoAspectRatios[index];
      if (!value) return fallback;

      const normalized = String(value).replace(":", " /").trim();
      return /^\d+(\.\d+)?\s*\/\s*\d+(\.\d+)?$/.test(normalized)
        ? normalized
        : fallback;
    });
  }

  function applyFullPageGridPlacement(shell, index, orientations, totalCount) {
    const groupIndex = Math.floor(index / 4);
    const groupStart = groupIndex * 4;
    const isCompleteGroup = groupStart + 3 < totalCount;

    shell.style.gridColumn = "";
    shell.style.gridRow = "";
    shell.style.justifySelf = "";
    delete shell.dataset.groupPos;
    delete shell.dataset.middleLayout;

    if (!isCompleteGroup) return;

    const pos = (index % 4) + 1;
    const rowStart = groupIndex * 2 + 1;
    const middleLeft = orientations[groupStart + 1];
    const middleRight = orientations[groupStart + 2];
    const middlePairBothVertical = middleLeft === "vertical" && middleRight === "vertical";
    const middlePairBothHorizontal = middleLeft === "horizontal" && middleRight === "horizontal";

    shell.dataset.groupPos = String(pos);

    if (pos === 1) {
      shell.style.gridColumn = "1";
      shell.style.gridRow = `${rowStart} / span 2`;
      return;
    }

    if (pos === 4) {
      shell.style.gridColumn = "3";
      shell.style.gridRow = `${rowStart} / span 2`;
      return;
    }

    if (middlePairBothVertical) {
      shell.dataset.middleLayout = "vertical-split";
      shell.style.gridColumn = "2";
      shell.style.gridRow = String(rowStart);
      shell.style.justifySelf = pos === 2 ? "start" : "end";
      return;
    }

    if (middlePairBothHorizontal) {
      shell.dataset.middleLayout = "horizontal-stack";
      shell.style.gridColumn = "2";
      shell.style.gridRow = String(rowStart + (pos === 2 ? 0 : 1));
      return;
    }

    shell.style.gridColumn = "2";
    shell.style.gridRow = String(rowStart + (pos === 2 ? 0 : 1));
  }

  function prepareGalleryData() {
    let currentStartIndex = 0;
    state.gallery.albumRanges = data.photoAlbums.map((album) => {
      const range = {
        name: album.name,
        startIndex: currentStartIndex,
        length: album.images.length
      };
      currentStartIndex += album.images.length;
      return range;
    });

    state.gallery.flatImages = data.photoAlbums.flatMap((album) =>
      album.images.map((src, imageIndex) => ({
        src,
        albumName: album.name,
        albumDetails: album.details,
        imageIndex
      }))
    );
    updateAlbumName();
  }

  function openGallery() {
    if (!state.gallery.flatImages.length) return;
    state.gallery.paused = false;
    clearGalleryTimers();
    state.gallery.sequence = [];
    state.gallery.albumQueue = buildAlbumQueue();
    state.gallery.albumQueueIndex = 0;
    state.gallery.activeAlbumIndex = -1;
    state.gallery.activeAlbumPhotoIndex = 0;
    state.gallery.currentIndex = -1;
    state.gallery.draggedPositions = new Map();
    state.gallery.cardNodes = new Map();
    els.photoStage.innerHTML = "";
    resetGalleryTrackQueue();
    els.albumName.textContent = "—";
    els.albumDetails.textContent = "";
    renderGallery();
    startGalleryAlbum(getNextAlbumIndex());

    playGalleryAudio();
  }

  function handleGalleryKeydown(event) {
    if (event.code === "Escape") {
      if (document.body.classList.contains("route-project")) {
        event.preventDefault();
        location.hash = "#showreel";
      }
      return;
    }

    if (event.code !== "Space") return;
    if (!document.body.classList.contains("route-35mm")) return;

    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.closest("input, textarea, button, a, iframe") || target.isContentEditable)
    ) {
      return;
    }

    event.preventDefault();
    state.gallery.paused = !state.gallery.paused;
    renderGallery();
  }

  function stopGallery() {
    clearGalleryTimers();
    pauseGalleryAudio();
    state.gallery.currentIndex = -1;
    state.gallery.cardNodes = new Map();
    els.photoStage.innerHTML = "";
    els.albumName.textContent = "—";
  }

  function clearGalleryTimers() {
    if (state.gallery.timer) {
      window.clearTimeout(state.gallery.timer);
      state.gallery.timer = null;
    }
    if (state.gallery.buildTimer) {
      window.clearTimeout(state.gallery.buildTimer);
      state.gallery.buildTimer = null;
    }
  }

  function buildAlbumQueue() {
    const queue = state.gallery.albumRanges.map((_, index) => index);

    for (let index = queue.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [queue[index], queue[randomIndex]] = [queue[randomIndex], queue[index]];
    }

    return queue;
  }

  function getNextAlbumIndex() {
    if (state.gallery.albumQueueIndex >= state.gallery.albumQueue.length) {
      return -1;
    }

    const nextAlbumIndex = state.gallery.albumQueue[state.gallery.albumQueueIndex];
    state.gallery.albumQueueIndex += 1;
    return nextAlbumIndex;
  }

  function startGalleryAlbum(albumIndex) {
    if (albumIndex < 0 || !state.gallery.albumRanges[albumIndex]) return;

    state.gallery.activeAlbumIndex = albumIndex;
    state.gallery.activeAlbumPhotoIndex = 0;
    const album = state.gallery.albumRanges[albumIndex];

    const runStep = () => {
      if (state.gallery.activeAlbumIndex !== albumIndex) return;

      if (state.gallery.paused || Date.now() < state.gallery.interactionLockUntil) {
        state.gallery.buildTimer = window.setTimeout(runStep, 220);
        return;
      }

      appendNextGalleryAlbumPhoto().then((appended) => {
        if (state.gallery.activeAlbumIndex !== albumIndex) return;

        if (!appended || state.gallery.activeAlbumPhotoIndex >= album.length) {
          state.gallery.buildTimer = null;
          scheduleNextGalleryAlbum();
          return;
        }

        state.gallery.buildTimer = window.setTimeout(runStep, 1200);
      });
    };

    runStep();
  }

  function appendNextGalleryAlbumPhoto() {
    const album = state.gallery.albumRanges[state.gallery.activeAlbumIndex];
    if (!album || state.gallery.activeAlbumPhotoIndex >= album.length) {
      return Promise.resolve(false);
    }

    const nextIndex = album.startIndex + state.gallery.activeAlbumPhotoIndex;
    const nextItem = state.gallery.flatImages[nextIndex];

    state.gallery.activeAlbumPhotoIndex += 1;
    if (!nextItem) {
      return Promise.resolve(true);
    }

    const previousEntry = state.gallery.sequence[state.gallery.sequence.length - 1];
    state.gallery.sequence.push({
      index: nextIndex,
      sizeMultiplier: getRandomPhotoSize(previousEntry?.sizeMultiplier)
    });

    const maxCards = window.innerWidth <= 860 ? 12 : 36;
    if (state.gallery.sequence.length > maxCards) {
      const removedEntries = state.gallery.sequence.splice(0, state.gallery.sequence.length - maxCards);
      removedEntries.forEach((entry) => {
        state.gallery.draggedPositions.delete(entry.index);
      });
    }

    state.gallery.currentIndex = nextIndex;
    updateAlbumName();
    renderGallery();
    return waitForRenderedGalleryImage(nextIndex).then(() => true);
  }

  function waitForRenderedGalleryImage(index, timeoutMs = 9000) {
    const card = state.gallery.cardNodes.get(index);
    const image = card?.querySelector("img");
    if (!image) return Promise.resolve(false);

    if (image.complete) {
      return Promise.resolve(image.naturalWidth > 0);
    }

    return new Promise((resolve) => {
      let settled = false;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        image.removeEventListener("load", onLoad);
        image.removeEventListener("error", onError);
        window.clearTimeout(timer);
        resolve(ok);
      };

      const onLoad = () => finish(true);
      const onError = () => finish(false);
      const timer = window.setTimeout(() => finish(false), timeoutMs);

      image.addEventListener("load", onLoad, { once: true });
      image.addEventListener("error", onError, { once: true });
    });
  }

  function scheduleNextGalleryAlbum() {
    if (state.gallery.timer) {
      window.clearTimeout(state.gallery.timer);
    }

    state.gallery.timer = window.setTimeout(() => {
      if (state.gallery.paused || Date.now() < state.gallery.interactionLockUntil) {
        scheduleNextGalleryAlbum();
        return;
      }

      const nextAlbumIndex = getNextAlbumIndex();
      if (nextAlbumIndex === -1) {
        state.gallery.timer = null;
        return;
      }

      startGalleryAlbum(nextAlbumIndex);
    }, 1000);
  }

  function getRandomPhotoSize(previousSize) {
    const sizeOptions = [1, 0.96, 0.9, 0.82, 0.74];
    const candidates = sizeOptions.filter((size) => size !== previousSize);
    return candidates[Math.floor(Math.random() * candidates.length)] ?? sizeOptions[0];
  }

  function renderGallery() {
    const spread = state.gallery.paused;
    const visibleEntries = state.gallery.sequence;

    if (!visibleEntries.length) {
      els.photoStage.innerHTML = "";
      state.gallery.cardNodes = new Map();
      return;
    }

    const visibleIndexes = new Set(visibleEntries.map((entry) => entry.index));
    state.gallery.cardNodes.forEach((card, index) => {
      if (visibleIndexes.has(index)) return;
      card.remove();
      state.gallery.cardNodes.delete(index);
    });

    visibleEntries.forEach((entry, position) => {
      const idx = entry.index;
      const item = state.gallery.flatImages[idx];
      if (!item) return;
      const isTopCard = position === visibleEntries.length - 1;
      let card = state.gallery.cardNodes.get(idx);
      if (!card) {
        card = document.createElement("div");
        card.className = "photo-card";
        card.dataset.index = String(idx);
        card.innerHTML = `<img src="${item.src}" alt="${item.albumName} photo ${item.imageIndex + 1}" loading="eager" decoding="async" />`;
        state.gallery.cardNodes.set(idx, card);
      }

      card.style.zIndex = String(100 + position);
      const spreadXStep = 20;
      const spreadYStep = 7;
      const spreadPosition = Math.max(-3, Math.min(3, position - (visibleEntries.length - 1) / 2));
      const dx = spread
        ? spreadPosition * spreadXStep
        : 0;
      const dy = spread
        ? spreadPosition * spreadYStep
        : 0;
      const scale = entry.sizeMultiplier;
      const persisted = state.gallery.draggedPositions.get(idx);

      if (persisted) {
        card.style.left = `${persisted.left}px`;
        card.style.top = `${persisted.top}px`;
        card.style.transformOrigin = "top left";
        card.style.transform = `scale(${persisted.scale})`;
        card.dataset.scale = String(persisted.scale);
      } else {
        card.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${scale})`;
        card.dataset.scale = String(scale);
      }
      card.dataset.x = "50";
      card.dataset.y = "50";
      card.dataset.dx = String(dx);
      card.dataset.dy = String(dy);

      const enableMobileTopDrag = window.innerWidth <= 860 && isTopCard;
      if ((spread || enableMobileTopDrag) && card.dataset.dragEnabled !== "true") {
        enableDragging(card);
        card.dataset.dragEnabled = "true";
      }

      els.photoStage.appendChild(card);
    });
  }

  function enableDragging(card) {
    let dragStartX = 0;
    let dragStartY = 0;
    let dragMoved = false;

    const markGalleryInteraction = () => {
      // While the user is interacting with photos, hold paced photo placement.
      state.gallery.interactionLockUntil = Date.now() + 2000;
    };

    const onPointerDown = (event) => {
      event.preventDefault();
      markGalleryInteraction();

      // Mobile has no spacebar: first drag on the top photo should enter spread mode.
      if (window.innerWidth <= 860 && !state.gallery.paused) {
        state.gallery.paused = true;
        renderGallery();
      }

      dragMoved = false;
      dragStartX = event.clientX;
      dragStartY = event.clientY;
      card.classList.add("is-dragging");
      
      const rect = card.getBoundingClientRect();
      const parentRect = els.photoStage.getBoundingClientRect();
      
      state.gallery.dragState = {
        card,
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        scale: Number(card.dataset.scale || 1)
      };
      
      card.style.left = `${rect.left - parentRect.left}px`;
      card.style.top = `${rect.top - parentRect.top}px`;
      card.style.transformOrigin = "top left";
      card.style.transform = `scale(${state.gallery.dragState.scale})`;
      
      card.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event) => {
      if (!state.gallery.dragState || state.gallery.dragState.card !== card) return;
      markGalleryInteraction();
      
      if (Math.abs(event.clientX - dragStartX) > 5 || Math.abs(event.clientY - dragStartY) > 5) {
        dragMoved = true;
      }

      const parentRect = els.photoStage.getBoundingClientRect();
      const x = event.clientX - parentRect.left - state.gallery.dragState.offsetX;
      const y = event.clientY - parentRect.top - state.gallery.dragState.offsetY;
      
      card.style.left = `${x}px`;
      card.style.top = `${y}px`;
    };

    const onPointerUp = (event) => {
      if (!state.gallery.dragState || state.gallery.dragState.card !== card) return;
      markGalleryInteraction();
      card.classList.remove("is-dragging");
      const index = Number(card.dataset.index);
      state.gallery.draggedPositions.set(index, {
        left: parseFloat(card.style.left) || 0,
        top: parseFloat(card.style.top) || 0,
        scale: state.gallery.dragState.scale
      });
      state.gallery.dragState = null;
      card.releasePointerCapture(event.pointerId);

      // On mobile: auto-exit spread mode after 2s of inactivity.
      if (window.innerWidth <= 860) {
        setTimeout(() => {
          if (state.gallery.paused && Date.now() >= state.gallery.interactionLockUntil) {
            state.gallery.paused = false;
            renderGallery();
          }
        }, 2000);
      }
    };

    card.addEventListener("pointerdown", onPointerDown);
    card.addEventListener("pointermove", onPointerMove);
    card.addEventListener("pointerup", onPointerUp);
    card.addEventListener("pointercancel", onPointerUp);
  }

  function updateAlbumName() {
    const current = state.gallery.flatImages[state.gallery.currentIndex];
    els.albumName.textContent = current?.albumName || "—";
    els.albumDetails.textContent = current?.albumDetails || "";
  }

  function playGalleryAudio() {
    els.volumeBars.classList.add("is-playing");
    if (!els.galleryAudio.src) {
      loadGalleryTrack();
    }
    els.galleryAudio.play().catch(() => {});
  }

  function pauseGalleryAudio() {
    els.volumeBars.classList.remove("is-playing");
    els.galleryAudio.pause();
  }

  function resetGalleryTrackQueue() {
    state.gallery.trackQueue = shuffleArray(galleryTracks);
    state.gallery.currentTrackQueueIndex = 0;
    loadGalleryTrack();
  }

  function loadGalleryTrack() {
    if (!galleryTracks.length) return;

    if (!state.gallery.trackQueue.length || state.gallery.currentTrackQueueIndex >= state.gallery.trackQueue.length) {
      state.gallery.trackQueue = shuffleArray(galleryTracks);
      state.gallery.currentTrackQueueIndex = 0;
    }

    const track = state.gallery.trackQueue[state.gallery.currentTrackQueueIndex];
    if (!track) return;

    els.galleryAudio.src = track;
    els.galleryAudio.load();
    syncGalleryVolume();
  }

  function handleGalleryTrackEnd() {
    if (!galleryTracks.length) return;

    state.gallery.currentTrackQueueIndex += 1;
    loadGalleryTrack();
    if (document.body.classList.contains("route-35mm")) {
      els.galleryAudio.play().catch(() => {});
    }
  }

  function toggleGalleryMute() {
    const willMute = !els.galleryAudio.muted;
    els.galleryAudio.muted = willMute;
    els.muteAudio.setAttribute("aria-pressed", String(willMute));
    els.muteAudio.textContent = willMute ? "unmute" : "mute";
    syncGalleryVolume();
  }

  function syncGalleryVolume() {
    const level = Math.min(6, Math.max(1, state.gallery.volumeLevel || 3));
    els.galleryAudio.volume = level / 6;
    const isMuted = els.galleryAudio.muted;
    els.volumeLines.forEach((line, index) => {
      const isActive = !isMuted && index < level;
      line.classList.toggle("is-active", isActive);
      line.setAttribute("aria-pressed", String(isActive));
    });
  }

  function setVolumeFromPointerEvent(event) {
    const rect = els.volumeBars.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const clampedRatio = Math.max(0, Math.min(1, ratio));
    state.gallery.volumeLevel = Math.round(clampedRatio * 5) + 1;
    syncGalleryVolume();
  }

  function shuffleArray(items) {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
    }
    return copy;
  }

  function debounce(fn, wait = 120) {
    let timer = null;
    return (...args) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => fn(...args), wait);
    };
  }

  init();
})();
