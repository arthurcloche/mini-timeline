function createTimeline(setup, options = {}) {
  const tracks = new Map();
  const parents = new Set();
  const callbacks = { start: [], end: [], loop: [] };
  let currentProgress = 0;
  let hasStarted = false;
  let hasEnded = false;

  const defaultEasing = options.defaultEasing || ((t) => t);
  const defaultLoop = options.defaultLoop || 0;

  // Helper for safe callback execution
  const executeCallback = (callback, errorMsg = "Callback error") => {
    try {
      callback();
    } catch (e) {
      console.warn(`${errorMsg}:`, e);
    }
  };

  // Keyframe builder
  function createKeyframes() {
    const segments = [];
    let currentPos = 0;
    let loopCount = defaultLoop;
    let parentTrack = null;

    // Helper to parse easing/callback arguments
    const parseEasingCallback = (easing, callback) => {
      if (typeof easing === "function" && typeof callback === "undefined") {
        return { easing: defaultEasing, callback: easing };
      }
      return { easing: easing || defaultEasing, callback };
    };

    const builder = {
      start(value, delay = 0, callback) {
        segments.push({ pos: delay, value, callback, type: "start" });
        currentPos = delay;
        return builder;
      },

      at(progress, value, easing = defaultEasing, callback) {
        const { easing: finalEasing, callback: finalCallback } = parseEasingCallback(easing, callback);
        segments.push({ pos: progress, value, easing: finalEasing, callback: finalCallback, type: "tween" });
        currentPos = progress;
        return builder;
      },

      then(value, duration, easing = defaultEasing, callback) {
        const { easing: finalEasing, callback: finalCallback } = parseEasingCallback(easing, callback);
        const nextPos = currentPos + duration;
        segments.push({ pos: nextPos, value, easing: finalEasing, callback: finalCallback, type: "tween" });
        currentPos = nextPos;
        return builder;
      },

      step(value, duration, callback) {
        const nextPos = currentPos + duration;
        segments.push({
          pos: nextPos,
          value,
          callback,
          type: "step",
        });
        currentPos = nextPos;
        return builder;
      },

      hold(duration) {
        const endPos = duration === undefined ? 1 : currentPos + duration;
        segments.push({ pos: currentPos, type: "hold_start" });
        segments.push({ pos: endPos, type: "hold_end" });
        currentPos = endPos;
        return builder;
      },

      child(track, duration) {
        if (!parents.has(track)) {
          console.warn("Invalid parent track - track must be registered as parent");
          return builder;
        }
        parentTrack = track;
        const endPos = duration === undefined ? 1 : currentPos + duration;
        segments.push({ pos: currentPos, type: "child_start" });
        segments.push({ pos: endPos, type: "child_end" });
        currentPos = endPos;
        return builder;
      },

      when(progress, callback) {
        const pos = typeof progress === "string" 
          ? (progress === "end" ? 1 : progress === "start" ? 0 : parseFloat(progress))
          : progress;
        segments.push({ pos, callback, type: "callback" });
        return builder;
      },

      loop(count = Infinity) {
        loopCount = count;
        return builder;
      },
    };

    builder._compile = () => {
      segments.sort((a, b) => a.pos - b.pos);

      // Remove duplicates and warn
      const seenPositions = new Map();
      const filteredSegments = [];

      segments.forEach((seg) => {
        const key = `${seg.pos}-${seg.type}`;

        if (seenPositions.has(key)) {
          console.warn(
            `Duplicate ${seg.type} at position ${seg.pos} - ignoring duplicate`
          );
        } else {
          seenPositions.set(key, true);
          filteredSegments.push(seg);
        }
      });

      return { segments: filteredSegments, loopCount, parentTrack };
    };

    return builder;
  }

  const timeline = {
    keyframes: (fn) => {
      const kf = createKeyframes();
      fn(kf);
      return kf._compile();
    },

    track: (keyframesOrFn) => {
      const compiled =
        typeof keyframesOrFn === "function"
          ? timeline.keyframes(keyframesOrFn)
          : keyframesOrFn;

      const track = {
        ...compiled,
        currentValue: 0,
        getValue: (progress) => interpolateTrack(compiled, progress),
        parent: () => {
          if (compiled.parentTrack) {
            console.warn("Track with child relationship cannot be a parent");
            return track;
          }
          parents.add(track);
          return track;
        },
      };

      tracks.set(track, compiled);
      return track;
    },

    stagger: (count, offset, keyframesFn) => {
      const compiled = timeline.keyframes(keyframesFn);
      return Array.from({ length: count }, (_, i) => {
        const track = {
          ...compiled,
          currentValue: 0,
          staggerDelay: i * offset,
          getValue: (progress) => {
            const staggeredProgress = Math.max(0, progress - i * offset);
            const normalizedProgress = Math.min(
              1,
              staggeredProgress / (1 - i * offset)
            );
            return normalizedProgress > 0
              ? interpolateTrack(compiled, normalizedProgress)
              : 0;
          },
        };
        tracks.set(track, compiled);
        return track;
      });
    },

    update: (progress) => {
      const prevProgress = currentProgress;
      currentProgress = progress;

      // Fire timeline start callbacks
      if (!hasStarted && progress > 0) {
        hasStarted = true;
        callbacks.start.forEach(cb => executeCallback(cb, "Start callback error"));
      }

      // Fire timeline end callbacks
      if (!hasEnded && progress >= 1) {
        hasEnded = true;
        callbacks.end.forEach(cb => executeCallback(cb, "End callback error"));
      }

      // Reset flags if rewinding
      if (progress < prevProgress) {
        if (progress === 0) {
          hasStarted = false;
          hasEnded = false;
        } else if (progress < 1) {
          hasEnded = false;
        }
      }

      for (const [track, compiled] of tracks) {
        track.currentValue = track.getValue(progress);

        // Handle callbacks - fire when progress crosses the callback position
        if (compiled.segments) {
          compiled.segments.forEach((seg) => {
            if (seg.callback && seg.pos <= progress && seg.pos > prevProgress) {
              executeCallback(seg.callback);
            }
          });
        }
      }
    },

    onStart: (fn) => callbacks.start.push(fn),
    onEnd: (fn) => callbacks.end.push(fn),
    onLoop: (fn) => callbacks.loop.push(fn),

    remap: (track, min, max) => min + track.currentValue * (max - min),
    ease: (value, easingFn) => easingFn(value),
  };

  // Helper function to calculate value at a specific position
  function calculateValueAtPosition(valueSegments, targetPos) {
    if (!valueSegments.length) return 0;
    
    let prevSeg = valueSegments[0];
    
    for (let i = 1; i < valueSegments.length; i++) {
      const seg = valueSegments[i];
      
      if (targetPos <= seg.pos) {
        if (seg.type === "step") {
          return targetPos >= seg.pos ? seg.value : prevSeg.value;
        } else if (seg.type === "tween" && prevSeg.value !== undefined && seg.value !== undefined) {
          const t = (targetPos - prevSeg.pos) / (seg.pos - prevSeg.pos);
          const easedT = seg.easing ? seg.easing(t) : t;
          return prevSeg.value + (seg.value - prevSeg.value) * easedT;
        }
        return seg.value || 0;
      }
      
      if (seg.value !== undefined) {
        prevSeg = seg;
      }
    }
    
    return prevSeg.value || 0;
  }

  function interpolateTrack(compiled, progress) {
    // Note: Don't override progress for child tracks - they use timeline progress
    // and follow parent values only during child periods

    const { segments, loopCount } = compiled;
    if (!segments.length) return 0;

    progress = Math.max(0, Math.min(1, progress));

    // Handle looping
    if (loopCount > 0) {
      if (loopCount === Infinity) {
        progress = progress % 1;
      } else {
        const loopedProgress = (progress * loopCount) % 1;
        progress = loopedProgress;
      }
    }

    const valueSegments = segments.filter((seg) => seg.type !== "callback");
    if (!valueSegments.length) return 0;

    // Find control positions
    let childStartPos = null, childEndPos = null;
    let holdStartPos = null, holdEndPos = null;
    
    for (const seg of segments) {
      if (seg.type === "child_start") childStartPos = seg.pos;
      if (seg.type === "child_end") childEndPos = seg.pos;
      if (seg.type === "hold_start") holdStartPos = seg.pos;
      if (seg.type === "hold_end") holdEndPos = seg.pos;
    }
    
    // Handle child mode - check this first for child tracks
    if (compiled.parentTrack && childStartPos !== null && childEndPos !== null && 
        progress >= childStartPos && progress < childEndPos) {
      return compiled.parentTrack.currentValue;
    }
    
    // Handle hold period
    if (holdStartPos !== null && holdEndPos !== null && 
        progress >= holdStartPos && progress < holdEndPos) {
      return calculateValueAtPosition(valueSegments, holdStartPos);
    }
    
    // Handle post-hold interpolation
    if (holdStartPos !== null && holdEndPos !== null && progress >= holdEndPos) {
      const holdValue = calculateValueAtPosition(valueSegments, holdStartPos);
      
      // Find next segment after hold
      const nextSegAfterHold = valueSegments.find(seg => seg.pos > holdEndPos);
      
      if (nextSegAfterHold && progress <= nextSegAfterHold.pos) {
        const t = (progress - holdEndPos) / (nextSegAfterHold.pos - holdEndPos);
        const easedT = nextSegAfterHold.easing ? nextSegAfterHold.easing(t) : t;
        return holdValue + (nextSegAfterHold.value - holdValue) * easedT;
      }
      
      return nextSegAfterHold ? nextSegAfterHold.value : holdValue;
    }
    
    // Standard interpolation
    return calculateValueAtPosition(valueSegments, progress);
  }

  // Execute setup
  const result = setup(timeline);
  return { ...result, timeline };
}

// React hook version
function useTimeline(setup, options) {
  // In React, you'd use useMemo here
  return createTimeline(setup, options);
}

export { createTimeline, useTimeline };
