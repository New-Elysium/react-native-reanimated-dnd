import React, { useCallback, useMemo, useRef } from "react";
import { LayoutChangeEvent, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { DropProvider } from "../context/DropContext";
import type { DropProviderRef, DraggingPayload } from "../types/context";
import type {
  SortableBoardColumn,
  SortableBoardItem,
  SortableBoardMoveEvent,
  SortableBoardProps,
} from "../types/sortableBoard";
import { Draggable } from "./Draggable";
import { Droppable } from "./Droppable";
import { DropScrollView } from "./DropScrollView";

interface BoardDragData<TItem extends SortableBoardItem> {
  item: TItem;
  itemId: string;
  sourceColumnId: string;
  sourceIndex: number;
}

interface SortableBoardCardProps<TItem extends SortableBoardItem> {
  item: TItem;
  columnId: string;
  itemIndex: number;
  itemGap: number;
  activationDelay: number;
  activeItemId: SharedValue<string>;
  activeSourceColumnId: SharedValue<string>;
  activeSourceIndex: SharedValue<number>;
  previewColumnId: SharedValue<string>;
  previewIndex: SharedValue<number>;
  activeSlotHeight: SharedValue<number>;
  itemContainerStyle: SortableBoardProps<
    TItem,
    SortableBoardColumn<TItem>
  >["itemContainerStyle"];
  activeDropStyle: SortableBoardProps<
    TItem,
    SortableBoardColumn<TItem>
  >["activeDropStyle"];
  renderItem: SortableBoardProps<
    TItem,
    SortableBoardColumn<TItem>
  >["renderItem"];
  moveItem: (
    dragData: BoardDragData<TItem>,
    targetColumnId: string,
    beforeItemId?: string
  ) => void;
}

function SortableBoardCard<TItem extends SortableBoardItem>({
  item,
  columnId,
  itemIndex,
  itemGap,
  activationDelay,
  activeItemId,
  activeSourceColumnId,
  activeSourceIndex,
  previewColumnId,
  previewIndex,
  activeSlotHeight,
  itemContainerStyle,
  activeDropStyle,
  renderItem,
  moveItem,
}: SortableBoardCardProps<TItem>) {
  // Keep the data object stable while React state updates during an active
  // gesture. Replacing the gesture's captured data would replace its native
  // handler before onFinalize can run.
  const dragData = useMemo<BoardDragData<TItem>>(
    () => ({
      item,
      itemId: item.id,
      sourceColumnId: columnId,
      sourceIndex: itemIndex,
    }),
    [columnId, item, itemIndex]
  );
  const sourceAnimatedStyle = useAnimatedStyle(() => {
    "worklet";
    const isActive = activeItemId.value === item.id;
    return {
      opacity: isActive ? 0 : 1,
      zIndex: isActive ? 1000 : 0,
      elevation: isActive ? 1000 : 0,
    };
  }, [activeItemId, item.id]);
  const positionAnimatedStyle = useAnimatedStyle(() => {
    "worklet";
    let translateY = 0;

    if (activeItemId.value !== "") {
      const sourceColumnId = activeSourceColumnId.value;
      const sourceIndex = activeSourceIndex.value;
      const targetColumnId = previewColumnId.value;
      const targetIndex = previewIndex.value;
      const slotHeight = activeSlotHeight.value;

      if (columnId === sourceColumnId && columnId === targetColumnId) {
        if (
          targetIndex > sourceIndex &&
          itemIndex > sourceIndex &&
          itemIndex < targetIndex
        ) {
          translateY = -slotHeight;
        } else if (
          targetIndex < sourceIndex &&
          itemIndex >= targetIndex &&
          itemIndex < sourceIndex
        ) {
          translateY = slotHeight;
        }
      } else if (columnId === sourceColumnId && itemIndex > sourceIndex) {
        translateY = -slotHeight;
      } else if (columnId === targetColumnId && itemIndex >= targetIndex) {
        translateY = slotHeight;
      }
    }

    return {
      transform: [
        {
          translateY: withTiming(translateY, {
            duration: 140,
          }),
        },
      ],
    };
  }, [
    activeItemId,
    activeSlotHeight,
    activeSourceColumnId,
    activeSourceIndex,
    columnId,
    itemIndex,
    previewColumnId,
    previewIndex,
  ]);
  const handleActiveChange = useCallback(
    (isActive: boolean) => {
      if (!isActive) {
        return;
      }

      previewColumnId.value = columnId;
      previewIndex.value = itemIndex;
    },
    [columnId, itemIndex, previewColumnId, previewIndex]
  );

  return (
    <Animated.View style={positionAnimatedStyle}>
      <Droppable<BoardDragData<TItem>>
        droppableId={`board-item-${columnId}-${item.id}`}
        dropPriority={10}
        capacity={Infinity}
        onDrop={(droppedData) => moveItem(droppedData, columnId, item.id)}
        onActiveChange={handleActiveChange}
        activeStyle={activeDropStyle}
        style={[{ marginBottom: itemGap }, itemContainerStyle]}
      >
        <Draggable<BoardDragData<TItem>>
          data={dragData}
          draggableId={`board-draggable-${item.id}`}
          preDragDelay={activationDelay}
          collisionAlgorithm="center"
          snapBackAfterDrop
          style={sourceAnimatedStyle}
        >
          <Draggable.Handle style={styles.cardHandle}>
            {renderItem({
              item,
              columnId,
              index: itemIndex,
              isDragging: false,
              isOverlay: false,
            })}
          </Draggable.Handle>
        </Draggable>
      </Droppable>
    </Animated.View>
  );
}

interface BoardColumnContainerProps {
  columnId: string;
  activeColumnId: SharedValue<string>;
  width: number;
  style: SortableBoardProps<
    SortableBoardItem,
    SortableBoardColumn<SortableBoardItem>
  >["columnStyle"];
  children: React.ReactNode;
}

function BoardColumnContainer({
  columnId,
  activeColumnId,
  width,
  style,
  children,
}: BoardColumnContainerProps) {
  const activeStyle = useAnimatedStyle(() => {
    "worklet";
    const isActive = activeColumnId.value === columnId;
    return {
      zIndex: isActive ? 100 : 0,
      elevation: isActive ? 100 : 0,
    };
  }, [activeColumnId, columnId]);

  return (
    <Animated.View style={[styles.column, { width }, style, activeStyle]}>
      {children}
    </Animated.View>
  );
}

interface BoardOverlayItemProps<TItem extends SortableBoardItem> {
  item: TItem;
  columnId: string;
  index: number;
  activeItemId: SharedValue<string>;
  overlayX: SharedValue<number>;
  overlayY: SharedValue<number>;
  renderItem: SortableBoardProps<
    TItem,
    SortableBoardColumn<TItem>
  >["renderItem"];
  overlayStyle: SortableBoardProps<
    TItem,
    SortableBoardColumn<TItem>
  >["overlayStyle"];
  activeItemContainerStyle: SortableBoardProps<
    TItem,
    SortableBoardColumn<TItem>
  >["activeItemContainerStyle"];
}

function BoardOverlayItem<TItem extends SortableBoardItem>({
  item,
  columnId,
  index,
  activeItemId,
  overlayX,
  overlayY,
  renderItem,
  overlayStyle,
  activeItemContainerStyle,
}: BoardOverlayItemProps<TItem>) {
  const animatedStyle = useAnimatedStyle(() => {
    "worklet";
    return {
      opacity: activeItemId.value === item.id ? 1 : 0,
      transform: [
        { translateX: overlayX.value },
        { translateY: overlayY.value },
      ] as const,
    };
  }, [activeItemId, item.id, overlayX, overlayY]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.overlayItem,
        animatedStyle,
        activeItemContainerStyle,
        overlayStyle,
      ]}
    >
      {renderItem({
        item,
        columnId,
        index,
        isDragging: true,
        isOverlay: true,
      })}
    </Animated.View>
  );
}

/**
 * A controlled, multi-column sortable board.
 *
 * Cards can be reordered inside one column or moved across columns. The board
 * uses nested prioritized drop zones, root-level drag rendering, and
 * provider-aware edge auto-scroll for Kanban-style interactions.
 */
export function SortableBoard<
  TItem extends SortableBoardItem,
  TColumn extends SortableBoardColumn<TItem>,
>({
  columns,
  renderItem,
  onChange,
  renderColumnHeader,
  renderEmptyColumn,
  columnWidth = 280,
  columnGap = 12,
  itemGap = 10,
  activationDelay = 150,
  autoScroll = true,
  autoScrollThreshold = 56,
  autoScrollStep = 14,
  style,
  contentContainerStyle,
  columnStyle,
  columnContentStyle,
  itemContainerStyle,
  activeItemContainerStyle,
  activeDropStyle,
  overlayStyle,
  onDragStart,
  onDragEnd,
}: SortableBoardProps<TItem, TColumn>) {
  const providerRef = useRef<DropProviderRef>(null);
  const rootRef = useRef<View>(null);
  const rootPagePositionRef = useRef({ x: 0, y: 0 });
  const activeItemId = useSharedValue("");
  const activeColumnId = useSharedValue("");
  const activeSourceColumnId = useSharedValue("");
  const activeSourceIndex = useSharedValue(-1);
  const previewColumnId = useSharedValue("");
  const previewIndex = useSharedValue(-1);
  const activeSlotHeight = useSharedValue(0);
  const overlayX = useSharedValue(0);
  const overlayY = useSharedValue(0);

  const itemLocations = useMemo(() => {
    const locations = new Map<
      string,
      { columnId: string; index: number; item: TItem }
    >();

    columns.forEach((column) => {
      column.items.forEach((item, index) => {
        locations.set(item.id, { columnId: column.id, index, item });
      });
    });

    return locations;
  }, [columns]);

  const measureRoot = useCallback(() => {
    rootRef.current?.measureInWindow((x, y) => {
      rootPagePositionRef.current = { x, y };
    });
  }, []);

  const handleRootLayout = useCallback(
    (_event: LayoutChangeEvent) => {
      measureRoot();
      providerRef.current?.requestPositionUpdate();
    },
    [measureRoot]
  );

  const moveItem = useCallback(
    (
      dragData: BoardDragData<TItem>,
      targetColumnId: string,
      beforeItemId?: string
    ) => {
      if (beforeItemId === dragData.itemId) {
        return;
      }

      const sourceLocation = itemLocations.get(dragData.itemId);
      const targetColumn = columns.find(
        (column) => column.id === targetColumnId
      );

      if (!sourceLocation || !targetColumn) {
        return;
      }

      const nextColumns = columns.map((column) => ({
        ...column,
        items: [...column.items],
      })) as TColumn[];
      const nextSourceColumn = nextColumns.find(
        (column) => column.id === sourceLocation.columnId
      );
      const nextTargetColumn = nextColumns.find(
        (column) => column.id === targetColumnId
      );

      if (!nextSourceColumn || !nextTargetColumn) {
        return;
      }

      const sourceIndex = nextSourceColumn.items.findIndex(
        (item) => item.id === dragData.itemId
      );
      if (sourceIndex < 0) {
        return;
      }

      const [movedItem] = nextSourceColumn.items.splice(sourceIndex, 1);
      let targetIndex =
        beforeItemId === undefined
          ? nextTargetColumn.items.length
          : nextTargetColumn.items.findIndex(
              (item) => item.id === beforeItemId
            );

      if (targetIndex < 0) {
        targetIndex = nextTargetColumn.items.length;
      }

      nextTargetColumn.items.splice(targetIndex, 0, movedItem);

      const event: SortableBoardMoveEvent<TItem> = {
        item: movedItem,
        fromColumnId: sourceLocation.columnId,
        toColumnId: targetColumnId,
        fromIndex: sourceIndex,
        toIndex: targetIndex,
      };

      const isNoOp =
        event.fromColumnId === event.toColumnId &&
        event.fromIndex === event.toIndex;
      if (!isNoOp) {
        onChange(nextColumns, event);
      }
    },
    [columns, itemLocations, onChange]
  );

  const handleDragStart = useCallback(
    (dragData: BoardDragData<TItem>) => {
      measureRoot();
      const currentLocation = itemLocations.get(dragData.itemId);
      const nextDragData = currentLocation
        ? {
            ...dragData,
            sourceColumnId: currentLocation.columnId,
            sourceIndex: currentLocation.index,
          }
        : dragData;
      activeItemId.value = nextDragData.itemId;
      activeColumnId.value = nextDragData.sourceColumnId;
      activeSourceColumnId.value = nextDragData.sourceColumnId;
      activeSourceIndex.value = nextDragData.sourceIndex;
      previewColumnId.value = nextDragData.sourceColumnId;
      previewIndex.value = nextDragData.sourceIndex;
      onDragStart?.(
        nextDragData.item,
        nextDragData.sourceColumnId,
        nextDragData.sourceIndex
      );
    },
    [
      activeColumnId,
      activeItemId,
      activeSourceColumnId,
      activeSourceIndex,
      itemLocations,
      measureRoot,
      onDragStart,
      previewColumnId,
      previewIndex,
    ]
  );

  const handleDragging = useCallback(
    (payload: DraggingPayload<BoardDragData<TItem>>) => {
      overlayX.value = payload.x + payload.tx - rootPagePositionRef.current.x;
      overlayY.value = payload.y + payload.ty - rootPagePositionRef.current.y;
      activeSlotHeight.value = payload.height + itemGap;
    },
    [activeSlotHeight, itemGap, overlayX, overlayY]
  );

  const handleDragEnd = useCallback(
    (dragData: BoardDragData<TItem>) => {
      activeItemId.value = "";
      activeColumnId.value = "";
      activeSourceColumnId.value = "";
      activeSourceIndex.value = -1;
      previewColumnId.value = "";
      previewIndex.value = -1;
      activeSlotHeight.value = 0;
      onDragEnd?.(dragData.item);
    },
    [
      activeColumnId,
      activeItemId,
      activeSlotHeight,
      activeSourceColumnId,
      activeSourceIndex,
      onDragEnd,
      previewColumnId,
      previewIndex,
    ]
  );

  return (
    <GestureHandlerRootView style={[styles.root, style]}>
      <View
        ref={rootRef}
        collapsable={false}
        onLayout={handleRootLayout}
        style={styles.root}
      >
        <DropProvider
          ref={providerRef}
          onDragStart={handleDragStart}
          onDragging={handleDragging}
          onDragEnd={handleDragEnd}
        >
          <DropScrollView
            horizontal
            autoScroll={autoScroll}
            autoScrollThreshold={autoScrollThreshold}
            autoScrollStep={autoScrollStep}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[
              styles.boardContent,
              { columnGap },
              contentContainerStyle,
            ]}
          >
            {columns.map((column, columnIndex) => {
              const handleColumnActiveChange = (isActive: boolean) => {
                if (!isActive) {
                  return;
                }

                previewColumnId.value = column.id;
                previewIndex.value = column.items.length;
              };

              return (
                <BoardColumnContainer
                  key={column.id}
                  columnId={column.id}
                  activeColumnId={activeColumnId}
                  width={columnWidth}
                  style={columnStyle}
                >
                  {renderColumnHeader?.(column, columnIndex)}
                  <Droppable<BoardDragData<TItem>>
                    droppableId={`board-column-${column.id}`}
                    dropPriority={0}
                    capacity={Infinity}
                    onDrop={(dragData) => moveItem(dragData, column.id)}
                    onActiveChange={handleColumnActiveChange}
                    activeStyle={activeDropStyle}
                    style={styles.columnDropTarget}
                  >
                    <DropScrollView
                      autoScroll={autoScroll}
                      autoScrollThreshold={autoScrollThreshold}
                      autoScrollStep={autoScrollStep}
                      nestedScrollEnabled
                      showsVerticalScrollIndicator={false}
                      contentContainerStyle={[
                        styles.columnContent,
                        columnContentStyle,
                      ]}
                    >
                      {column.items.map((item, itemIndex) => {
                        return (
                          <SortableBoardCard
                            key={item.id}
                            item={item}
                            columnId={column.id}
                            itemIndex={itemIndex}
                            itemGap={itemGap}
                            activationDelay={activationDelay}
                            activeItemId={activeItemId}
                            activeSourceColumnId={activeSourceColumnId}
                            activeSourceIndex={activeSourceIndex}
                            previewColumnId={previewColumnId}
                            previewIndex={previewIndex}
                            activeSlotHeight={activeSlotHeight}
                            itemContainerStyle={itemContainerStyle}
                            activeDropStyle={activeDropStyle}
                            renderItem={renderItem}
                            moveItem={moveItem}
                          />
                        );
                      })}

                      <Droppable<BoardDragData<TItem>>
                        droppableId={`board-append-${column.id}`}
                        dropPriority={20}
                        capacity={Infinity}
                        onDrop={(dragData) => moveItem(dragData, column.id)}
                        onActiveChange={handleColumnActiveChange}
                        activeStyle={activeDropStyle}
                        style={styles.appendTarget}
                      >
                        {column.items.length === 0
                          ? renderEmptyColumn?.(column, columnIndex)
                          : null}
                      </Droppable>
                    </DropScrollView>
                  </Droppable>
                </BoardColumnContainer>
              );
            })}
          </DropScrollView>

          <View pointerEvents="none" style={styles.overlayContainer}>
            {columns.flatMap((column) =>
              column.items.map((item, index) => (
                <BoardOverlayItem
                  key={`overlay-${item.id}`}
                  item={item}
                  columnId={column.id}
                  index={index}
                  activeItemId={activeItemId}
                  overlayX={overlayX}
                  overlayY={overlayY}
                  renderItem={renderItem}
                  overlayStyle={overlayStyle}
                  activeItemContainerStyle={activeItemContainerStyle}
                />
              ))
            )}
          </View>
        </DropProvider>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    position: "relative",
    overflow: "visible",
  },
  boardContent: {
    flexGrow: 1,
    alignItems: "stretch",
  },
  column: {
    flex: 1,
    position: "relative",
    overflow: "visible",
  },
  columnDropTarget: {
    flex: 1,
  },
  columnContent: {
    flexGrow: 1,
  },
  cardHandle: {
    alignSelf: "stretch",
  },
  appendTarget: {
    flexGrow: 1,
    minHeight: 48,
  },
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10000,
    elevation: 10000,
  },
  overlayItem: {
    position: "absolute",
    left: 0,
    top: 0,
    zIndex: 10001,
    elevation: 10001,
  },
});
