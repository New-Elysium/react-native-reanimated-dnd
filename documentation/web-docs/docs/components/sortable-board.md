---
title: "SortableBoard"
---

`SortableBoard` is a controlled multi-list component for Kanban boards and
grouped lists. It supports reordering inside a column, moving items between
columns, nested vertical and horizontal auto-scroll, overlapping drop targets,
and a root-level drag overlay.

## Basic usage

```tsx
import {
  SortableBoard,
  SortableBoardColumn,
} from "react-native-reanimated-dnd";

interface Card {
  id: string;
  title: string;
}

interface Column extends SortableBoardColumn<Card> {
  title: string;
}

function Board() {
  const [columns, setColumns] = useState<Column[]>([
    {
      id: "todo",
      title: "To do",
      items: [{ id: "task-1", title: "Write tests" }],
    },
    {
      id: "done",
      title: "Done",
      items: [],
    },
  ]);

  return (
    <SortableBoard
      columns={columns}
      onChange={(nextColumns, event) => {
        setColumns(nextColumns);
        console.log(event.fromColumnId, event.toColumnId);
      }}
      renderColumnHeader={(column) => <Text>{column.title}</Text>}
      renderEmptyColumn={() => <Text>Drop here</Text>}
      renderItem={({ item, isOverlay }) => (
        <View style={styles.card}>
          <Text>{item.title}</Text>
          {isOverlay && <Text>Moving</Text>}
        </View>
      )}
    />
  );
}
```

`columns` is controlled. Apply the `nextColumns` value from `onChange` to
commit a move.

## Move event

```ts
interface SortableBoardMoveEvent<TItem> {
  item: TItem;
  fromColumnId: string;
  toColumnId: string;
  fromIndex: number;
  toIndex: number;
}
```

## Main props

| Prop                  | Type                           | Default  | Description                                      |
| --------------------- | ------------------------------ | -------- | ------------------------------------------------ |
| `columns`             | `SortableBoardColumn<TItem>[]` | Required | Controlled columns and ordered items             |
| `renderItem`          | `(props) => ReactNode`         | Required | Renders cards and their drag overlay             |
| `onChange`            | `(columns, event) => void`     | Required | Commits intra-list and cross-list moves          |
| `renderColumnHeader`  | `(column, index) => ReactNode` |          | Renders a column header                          |
| `renderEmptyColumn`   | `(column, index) => ReactNode` |          | Renders the empty drop target                    |
| `columnWidth`         | `number`                       | `280`    | Column width in points                           |
| `columnGap`           | `number`                       | `12`     | Horizontal spacing between columns               |
| `itemGap`             | `number`                       | `10`     | Vertical spacing between cards                   |
| `activationDelay`     | `number`                       | `150`    | Long-press delay before dragging                 |
| `autoScroll`          | `boolean`                      | `true`   | Enables horizontal and vertical edge auto-scroll |
| `autoScrollThreshold` | `number`                       | `56`     | Distance from an edge that starts scrolling      |
| `autoScrollStep`      | `number`                       | `14`     | Points scrolled per drag update                  |

All item IDs must be unique across the entire board.

## Drag overlay

The board keeps every card in its original list for collision measurement but
renders the active visual in a root-level overlay. This allows a card to pass
above sibling columns and scroll containers without z-index clipping. Use the
`isOverlay` render argument to omit interactive children from the overlay copy
when necessary.

## Nested lists

Each column and the horizontal board use `DropScrollView`. While a card is near
an edge, the relevant vertical column, the horizontal board, or both can scroll.
Measurements are refreshed after each scroll frame so drop targets stay aligned.
