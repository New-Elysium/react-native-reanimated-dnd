import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { LayoutChangeEvent, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { DropProvider } from "../context/DropContext";
import {
  SlotsContext,
  type DropProviderRef,
  type DraggingPayload,
  type SlotsContextValue,
} from "../types/context";
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

interface BoardDropTarget {
  columnId: string;
  index: number;
  type: "column" | "item" | "append";
}

interface BoardPreviewLocation {
  itemId: string;
  columnId: string;
  index: number;
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
  activeSlotHeight: SharedValue<number>;
  previewColumnId: SharedValue<string>;
  previewIndex: SharedValue<number>;
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
  activeSlotHeight,
  previewColumnId,
  previewIndex,
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
    const sourceColumnId = activeSourceColumnId.value;
    const sourceIndex = activeSourceIndex.value;
    const targetColumnId = previewColumnId.value;
    const targetIndex = previewIndex.value;
    const slotHeight = activeSlotHeight.value;
    let translateY = 0;

    if (!isActive && slotHeight > 0) {
      if (sourceColumnId === targetColumnId && columnId === sourceColumnId) {
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
      opacity: isActive ? 0 : 1,
      zIndex: isActive ? 1000 : 0,
      elevation: isActive ? 1000 : 0,
      transform: [
        {
          translateY: isActive ? 0 : withTiming(translateY, { duration: 160 }),
        },
      ] as const,
    };
  }, [
    activeItemId,
    activeSlotHeight,
    activeSourceColumnId,
    activeSourceIndex,
    columnId,
    item.id,
    itemIndex,
    previewColumnId,
    previewIndex,
  ]);

  return (
    <Droppable<BoardDragData<TItem>>
      droppableId={`board-item-${columnId}-${item.id}`}
      dropPriority={10}
      capacity={Infinity}
      onDrop={(droppedData) => moveItem(droppedData, columnId, item.id)}
      activeStyle={activeDropStyle}
      style={[{ marginBottom: itemGap }, itemContainerStyle]}
    >
      <Animated.View style={sourceAnimatedStyle}>
        <Draggable<BoardDragData<TItem>>
          data={dragData}
          draggableId={`board-draggable-${item.id}`}
          preDragDelay={activationDelay}
          collisionAlgorithm="center"
          snapBackAfterDrop
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
      </Animated.View>
    </Droppable>
  );
}

interface BoardDragPreviewMonitorProps {
  activeColumnId: SharedValue<string>;
  activeSlotHeight: SharedValue<number>;
  activeSourceColumnId: SharedValue<string>;
  activeSourceIndex: SharedValue<number>;
  dropTargets: Map<string, BoardDropTarget>;
  itemGap: number;
  previewColumnId: SharedValue<string>;
  previewIndex: SharedValue<number>;
  previewLocationRef: React.MutableRefObject<BoardPreviewLocation | null>;
}

function BoardDragPreviewMonitor({
  activeColumnId,
  activeSlotHeight,
  activeSourceColumnId,
  activeSourceIndex,
  dropTargets,
  itemGap,
  previewColumnId,
  previewIndex,
  previewLocationRef,
}: BoardDragPreviewMonitorProps) {
  const {
    activeHoverSlotId,
    getSlots,
    registerDraggingListener,
    unregisterDraggingListener,
  } = useContext(SlotsContext) as SlotsContextValue<BoardDragData<any>>;
  const listenerId = useRef(
    `sortable-board-preview-${Math.random().toString(36).slice(2, 11)}`
  ).current;
  const latestPayloadRef = useRef<DraggingPayload<BoardDragData<any>> | null>(
    null
  );

  const updatePreview = useCallback(
    (columnId: string, index: number, itemId: string) => {
      const currentPreview = previewLocationRef.current;
      if (
        currentPreview?.itemId === itemId &&
        currentPreview.columnId === columnId &&
        currentPreview.index === index
      ) {
        return;
      }

      previewLocationRef.current = { itemId, columnId, index };
      previewColumnId.value = columnId;
      previewIndex.value = index;
      activeColumnId.value = columnId;
    },
    [activeColumnId, previewColumnId, previewIndex, previewLocationRef]
  );

  const updatePreviewFromHover = useCallback(
    (
      payload: DraggingPayload<BoardDragData<any>>,
      hoveredSlotId: number | null
    ) => {
      const centerY = payload.y + payload.ty + payload.height / 2;
      const slots = Object.values(getSlots());
      const sourceColumnId = activeSourceColumnId.value;
      const sourceIndex = activeSourceIndex.value;
      const hoveredSlot =
        hoveredSlotId === null ? undefined : getSlots()[hoveredSlotId];
      const hoveredTarget = hoveredSlot
        ? dropTargets.get(hoveredSlot.id)
        : undefined;

      if (!hoveredTarget) {
        updatePreview(sourceColumnId, sourceIndex, payload.itemData.itemId);
        return;
      }

      const columnId = hoveredTarget.columnId;
      const itemSlots = slots
        .map((slot) => ({ slot, target: dropTargets.get(slot.id) }))
        .filter(
          (
            entry
          ): entry is {
            slot: (typeof slots)[number];
            target: BoardDropTarget;
          } =>
            entry.target?.type === "item" && entry.target.columnId === columnId
        )
        .sort((a, b) => a.target.index - b.target.index);

      const nextIndex =
        hoveredTarget.type === "append"
          ? hoveredTarget.index
          : (itemSlots.find(({ slot }) => centerY < slot.y + slot.height / 2)
              ?.target.index ?? itemSlots.length);

      updatePreview(columnId, nextIndex, payload.itemData.itemId);
    },
    [
      activeSourceColumnId,
      activeSourceIndex,
      dropTargets,
      getSlots,
      updatePreview,
    ]
  );

  const handleDragging = useCallback(
    (payload: DraggingPayload<BoardDragData<any>>) => {
      latestPayloadRef.current = payload;
      if (activeSlotHeight.value === 0) {
        activeSlotHeight.value = payload.height + itemGap;
      }
      updatePreviewFromHover(payload, activeHoverSlotId);
    },
    [activeHoverSlotId, activeSlotHeight, itemGap, updatePreviewFromHover]
  );

  useEffect(() => {
    const payload = latestPayloadRef.current;
    if (payload) {
      updatePreviewFromHover(payload, activeHoverSlotId);
    }
  }, [activeHoverSlotId, updatePreviewFromHover]);

  useEffect(() => {
    registerDraggingListener(listenerId, handleDragging);
    return () => unregisterDraggingListener(listenerId);
  }, [
    handleDragging,
    listenerId,
    registerDraggingListener,
    unregisterDraggingListener,
  ]);

  return null;
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
  const activeSlotHeight = useSharedValue(0);
  const previewColumnId = useSharedValue("");
  const previewIndex = useSharedValue(-1);
  const overlayX = useSharedValue(0);
  const overlayY = useSharedValue(0);
  const previewLocationRef = useRef<BoardPreviewLocation | null>(null);

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

  const dropTargets = useMemo(() => {
    const targets = new Map<string, BoardDropTarget>();

    columns.forEach((column) => {
      targets.set(`board-column-${column.id}`, {
        columnId: column.id,
        index: column.items.length,
        type: "column",
      });
      column.items.forEach((item, index) => {
        targets.set(`board-item-${column.id}-${item.id}`, {
          columnId: column.id,
          index,
          type: "item",
        });
      });
      targets.set(`board-append-${column.id}`, {
        columnId: column.id,
        index: column.items.length,
        type: "append",
      });
    });

    return targets;
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
      const previewLocation = previewLocationRef.current;
      if (previewLocation?.itemId === dragData.itemId) {
        targetColumnId = previewLocation.columnId;
        beforeItemId = columns
          .find((column) => column.id === targetColumnId)
          ?.items.at(previewLocation.index)?.id;
      }

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
      activeSlotHeight.value = 0;
      previewColumnId.value = nextDragData.sourceColumnId;
      previewIndex.value = nextDragData.sourceIndex;
      previewLocationRef.current = {
        itemId: nextDragData.itemId,
        columnId: nextDragData.sourceColumnId,
        index: nextDragData.sourceIndex,
      };
      onDragStart?.(
        nextDragData.item,
        nextDragData.sourceColumnId,
        nextDragData.sourceIndex
      );
    },
    [
      activeColumnId,
      activeItemId,
      activeSlotHeight,
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
    },
    [overlayX, overlayY]
  );

  const handleDragEnd = useCallback(
    (dragData: BoardDragData<TItem>) => {
      activeItemId.value = "";
      activeColumnId.value = "";
      activeSourceColumnId.value = "";
      activeSourceIndex.value = -1;
      activeSlotHeight.value = 0;
      previewColumnId.value = "";
      previewIndex.value = -1;
      previewLocationRef.current = null;
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
          <BoardDragPreviewMonitor
            activeColumnId={activeColumnId}
            activeSlotHeight={activeSlotHeight}
            activeSourceColumnId={activeSourceColumnId}
            activeSourceIndex={activeSourceIndex}
            dropTargets={dropTargets}
            itemGap={itemGap}
            previewColumnId={previewColumnId}
            previewIndex={previewIndex}
            previewLocationRef={previewLocationRef}
          />

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
                            activeSlotHeight={activeSlotHeight}
                            previewColumnId={previewColumnId}
                            previewIndex={previewIndex}
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
