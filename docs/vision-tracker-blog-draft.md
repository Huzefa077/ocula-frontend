# Building the Vision Tracker in Ocula Vision Lab

Ocula Vision Lab started as a browser-based face analysis project, but I also wanted to experiment with a more interactive computer vision feature: a Vision Tracker. The idea is simple from the user's point of view. The user allows camera access, aligns their face inside a guide, clicks calibration dots on the screen, and then the app estimates where they are looking.

This is not medical-grade eye tracking and it is not meant for security or identity verification. It is a learning project that demonstrates how webcam input, calibration data, and a browser machine learning library can work together inside a React app.

## What the Feature Does

The Vision Tracker runs in the browser. It asks for webcam permission, opens a fullscreen calibration screen, and shows a face silhouette so the user can position their head. After that, the user clicks a sequence of blue dots. Each click tells the model, "my eyes are looking at this screen position right now."

Once enough calibration points are collected, the tracker starts showing a live gaze dot. That dot is an estimate of where the user's eyes are looking on the screen.

## The Main Flow

The React component is organized around three phases:

```js
const TRACKER_PHASES = {
  CONSENT: 'CONSENT',
  FACE_LOCK: 'FACE_LOCK',
  CALIBRATION: 'CALIBRATION'
};
```

The consent phase explains what will happen and asks the user to start. The face-lock phase shows the webcam preview and instructions. The calibration phase shows the clickable dots and later displays the estimated gaze point.

This phase-based structure keeps the feature easier to reason about. Instead of one large screen with many mixed conditions, the UI changes based on the current tracker phase.

## How Calibration Works

The app creates 36 baseline calibration points in a 6 by 6 grid. These points cover the screen evenly, so the tracker gets examples from the top, middle, bottom, left, and right areas of the display.

Originally, the dots appeared row by row. That was predictable, so users could start looking toward the next dot before it appeared. I changed the order so the first dot starts near the center, then the remaining baseline dots are shuffled. This makes calibration less predictable and helps reduce anticipation.

After the baseline points, the app can add extra refinement points. These are random points used to give the model more examples.

## Why Mouse Clicks Are More Accurate Than Keyboard Input

The app supports pressing the `B` key, but mouse clicks are more accurate. With a mouse click, the user's hand and eye target are connected naturally: they look at the dot, move the cursor, and click the dot itself. With a keyboard press, users often press slightly before or after their gaze is stable. That timing difference can reduce accuracy.

For best results, the user should look at each blue dot, click it with the mouse, and keep looking at it briefly while the dot dims.

## Improving Capture Timing

A single calibration click can be noisy. The user might blink, the webcam frame might blur, or the face tracker might briefly lose a clean view of the eyes.

To reduce that problem, the app does not rely only on one instant sample. After a dot is clicked, the dot stays in place for a short cooldown period. During that hold, the app records multiple samples for the same screen coordinate.

The idea is simple: several small samples are usually better than betting everything on one frame.

```js
const CALIBRATION_INPUT_COOLDOWN_MS = 500;
const CALIBRATION_SAMPLE_INTERVAL_MS = 100;
```

During the 500ms hold, the app records about 4 to 5 samples for the same target position. The dot is dimmed while this happens so the user knows the next input is not ready yet.

## The Machine Learning Idea at a Basic Level

The tracker uses WebGazer.js. WebGazer estimates gaze by learning a relationship between webcam eye features and screen coordinates.

At a high level, the process looks like this:

1. The webcam captures the user's face and eye region.
2. WebGazer extracts visual features from the eye area.
3. The user clicks a known screen point.
4. The model stores that eye appearance together with the clicked screen coordinate.
5. After many examples, the model predicts where similar eye positions point on the screen.

This is supervised learning. The clicked dots are the labels. The webcam eye features are the input. The predicted gaze position is the output.

The model is sensitive because the camera sees only a small change when the user's eyes move. Small head movements can look similar to eye movements, so the user must keep their head still during calibration. Even small movements can reduce accuracy.

## Important UX Lessons

The hard part was not just "make the tracker work." The hard part was making the calibration understandable.

Some UX details mattered a lot:

- The user needs a face silhouette before calibration starts.
- The instructions must be short.
- The app must clearly show when a dot is clickable and when it is cooling down.
- Mobile instructions should not mention keyboard controls.
- The calibration dots should not appear in a predictable row-by-row pattern.
- The user should be told to keep their head still because the feature is very sensitive to movement.

For mobile users, I also recommend using a tripod or phone stand. It keeps the face steady inside the silhouette and gives the tracker cleaner input.

## Limitations

This feature is experimental. Accuracy depends on webcam quality, lighting, screen size, face position, glasses, reflections, and how carefully the user completes calibration.

It works best when:

- The user's face is well lit.
- The head stays still.
- The user moves only their eyes.
- The user clicks dots with the mouse.
- The face remains inside the silhouette.

It works worse when:

- The user moves their head during calibration.
- The room is dark.
- Reflections hide the pupils.
- The user presses keys instead of clicking dots.
- The webcam view is blurry or too zoomed in.

## What I Learned

This feature helped me understand that machine learning features are not only about the model. The surrounding product design matters just as much. Calibration timing, clear instructions, visual feedback, and input quality all affect the final result.

The Vision Tracker is still an experiment, but building it taught me how browser-based ML, React state, webcam permissions, and user calibration can work together in one feature.
