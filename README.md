# Mini Timeline

A minimal, frame-agnostic timeline library based on linear interpolation. Designed to be super small and focused, without trying to do too much.

## Quick Start

```javascript
import { createTimeline } from './timeline.js';

const { track, timeline } = createTimeline((timeline) => {
  const track = timeline.track((keyframes) => {
    keyframes
      .start(0)           // Start at value 0
      .at(0.5, 1)         // At progress 0.5, value should be 1
      .at(1, 0);          // At progress 1, value should be 0
  });
  
  return { track };
});

// Update timeline with progress (0-1)
timeline.update(0.25);
console.log(track.currentValue); // 0.5
```

## Core Concepts

### Progress-Based
Everything works with normalized progress values (0-1). The timeline doesn't care if you're driving it with time, scroll position, slider values, or anything else.

### Tracks
Tracks contain keyframes and output interpolated values. Each track is independent and can have its own animation curve.

### Keyframes
Define points in time with specific values. The timeline interpolates between these points.

## API Reference

### Creating a Timeline

```javascript
const result = createTimeline((timeline) => {
  // Define your tracks here
  return { track1, track2, ... };
}, options);
```

**Options:**
- `defaultEasing`: Function for default easing (default: linear)
- `defaultLoop`: Default loop count (default: 0)

### Keyframe Methods

#### `.start(value, delay?, callback?)`
Set the starting value with optional delay.

```javascript
keyframes.start(0)        // Start at 0
keyframes.start(0, 0.1)   // Start at 0 with 0.1 delay
```

#### `.at(progress, value, easing?, callback?)`
Create a keyframe at specific progress.

```javascript
keyframes.at(0.5, 1)                    // Linear to 1 at 50%
keyframes.at(0.8, 0.5, t => t * t)      // Quadratic easing
keyframes.at(1, 0, () => console.log('Done!'))  // With callback
```

#### `.then(value, duration, easing?, callback?)`
Create a keyframe relative to current position.

```javascript
keyframes
  .start(0)
  .then(1, 0.3)     // Go to 1 over 0.3 duration
  .then(0, 0.4);    // Then go to 0 over 0.4 duration
```

#### `.step(value, duration, callback?)`
Create a non-interpolated step change.

```javascript
keyframes.step(1, 0.5);  // Jump to 1 at current position + 0.5
```

#### `.hold(duration?)`
Hold the current value for a duration.

```javascript
keyframes
  .at(0.3, 0.8)
  .hold(0.3)        // Hold at 0.8 for 0.3 duration
  .at(0.9, 0);      // Then continue to 0
```

#### `.child(parentTrack, duration?)`
Follow a parent track's value for a duration.

```javascript
const parent = timeline.track(kf => kf.start(0).at(1, 1)).parent();
const child = timeline.track(kf => 
  kf.child(parent, 0.5)    // Follow parent for first 50%
    .at(1, 0.5)            // Then independent keyframes
);
```

#### `.when(progress, callback)`
Execute callback at specific progress (doesn't affect interpolation).

```javascript
keyframes.when(0.5, () => console.log('Halfway!'));
keyframes.when('end', () => console.log('Finished!'));
```

#### `.loop(count?)`
Set loop count for this track.

```javascript
keyframes.loop();     // Loop infinitely
keyframes.loop(3);    // Loop 3 times
```

### Track Methods

#### `.parent()`
Register track as a potential parent for child tracks.

```javascript
const parentTrack = timeline.track(keyframes).parent();
```

### Stagger

Create multiple tracks with staggered timing.

```javascript
const staggerTracks = timeline.stagger(5, 0.1, (keyframes) => {
  keyframes.start(0).at(0.5, 1).at(1, 0);
});
// Creates 5 tracks, each delayed by 0.1 from the previous
```

### Timeline Events

```javascript
timeline.onStart(() => console.log('Timeline started'));
timeline.onEnd(() => console.log('Timeline ended'));
timeline.onLoop((loopIndex) => console.log('Loop', loopIndex));
```

### Utilities

```javascript
// Remap track value to different range
const remapped = timeline.remap(track, 100, 300); // 0-1 becomes 100-300

// Apply easing to any value
const eased = timeline.ease(0.5, t => t * t); // Apply quadratic easing
```

## Examples

### Basic Animation
```javascript
const { fadeTrack, timeline } = createTimeline((timeline) => {
  const fadeTrack = timeline.track((kf) => {
    kf.start(0).at(0.5, 1).at(1, 0);
  });
  return { fadeTrack };
});

// Drive with time
function animate() {
  const progress = (Date.now() % 2000) / 2000; // 2 second loop
  timeline.update(progress);
  element.style.opacity = fadeTrack.currentValue;
  requestAnimationFrame(animate);
}
```

### Scroll-Driven Animation
```javascript
window.addEventListener('scroll', () => {
  const progress = window.scrollY / (document.body.scrollHeight - window.innerHeight);
  timeline.update(progress);
  
  element.style.transform = `translateY(${timeline.remap(track, -100, 100)}px)`;
});
```

### Complex Sequence
```javascript
const { slideTrack, fadeTrack, timeline } = createTimeline((timeline) => {
  // Slide in from left
  const slideTrack = timeline.track((kf) => {
    kf.start(-100).at(0.3, 0).hold(0.4).at(1, 100);
  });
  
  // Fade in then out
  const fadeTrack = timeline.track((kf) => {
    kf.start(0).at(0.2, 1).hold(0.6).at(1, 0);
  });
  
  return { slideTrack, fadeTrack };
});
```

## File Structure

- `timeline.js` - Main timeline implementation
- `demo.html` - Interactive canvas demo
- `idea.txt` - Original design notes

## Demo

Open `demo.html` in a browser to see an interactive demonstration of all features including:
- Parent/child relationships
- Hold periods
- Stagger effects
- Custom easing
- Callback execution

The demo shows real-time visualization of multiple tracks with different behaviors.