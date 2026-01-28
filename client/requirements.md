## Packages
framer-motion | Complex animations for chat bubbles and transitions
react-markdown | Rendering formatted text from the AI advisor
uuid | Generating initial session IDs on the client side

## Notes
- Session ID should be generated client-side if not present in localStorage, then registered with backend.
- Two-pane layout: Chat on left (fixed width), Content on right (flexible).
- Chat persists in memory/local state for the session duration.
