---
title: "DropScrollView"
---

`DropScrollView` is a provider-aware replacement for React Native's
`ScrollView`. It refreshes draggable and droppable measurements as content
scrolls and can auto-scroll while a draggable is near an edge.

```tsx
import {
  DropProvider,
  DropScrollView,
  Draggable,
  Droppable,
} from "react-native-reanimated-dnd";

function ScrollableDropList() {
  return (
    <DropProvider>
      <DropScrollView autoScroll autoScrollThreshold={64} autoScrollStep={16}>
        {/* Draggable and Droppable children */}
      </DropScrollView>
    </DropProvider>
  );
}
```

Use nested `DropScrollView` components for boards with a horizontal container
and vertical columns. Only a viewport containing the active draggable reacts,
so both axes can scroll together near a corner.

All standard React Native `ScrollView` props are supported.

| Prop                  | Type      | Default | Description                        |
| --------------------- | --------- | ------- | ---------------------------------- |
| `autoScroll`          | `boolean` | `true`  | Scroll while dragging near an edge |
| `autoScrollThreshold` | `number`  | `56`    | Edge activation distance           |
| `autoScrollStep`      | `number`  | `14`    | Points scrolled per drag update    |
| `horizontal`          | `boolean` | `false` | Select horizontal scrolling        |

`DropScrollView` must be rendered inside the same `DropProvider` as its
draggables and droppables.
