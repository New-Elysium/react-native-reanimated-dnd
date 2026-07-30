import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
} from "react";
import { LayoutChangeEvent, StyleProp, ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { GestureDetector } from "react-native-gesture-handler";
import { useHorizontalSortable } from "../hooks/useHorizontalSortable";
import { useSortable } from "../hooks/useSortable";
import {
  SortableDirection,
  SortableContextValue,
  SortableHandleProps,
  SortableItemProps,
  SortablePositionSync,
  UseHorizontalSortableOptions,
  UseSortableOptions,
} from "../types/sortable";

export interface SortableListContextValue {
  positionSync: SortablePositionSync;
  showDropIndicator?: boolean;
  dropIndicatorStyle?: StyleProp<ViewStyle>;
}

export const SortableListContext =
  createContext<SortableListContextValue | null>(null);

// Create a context to share gesture between SortableItem and SortableHandle
const SortableContext = createContext<SortableContextValue | null>(null);

/**
 * A handle component that can be used within SortableItem to create a specific
 * draggable area. When a SortableHandle is present, only the handle area can
 * initiate dragging, while the rest of the item remains non-draggable.
 *
 * @param props - Props for the handle component
 */
const SortableHandle = ({ children, style }: SortableHandleProps) => {
  const sortableContext = useContext(SortableContext);

  useEffect(() => {
    sortableContext?.registerHandle(true);
    return () => {
      sortableContext?.registerHandle(false);
    };
  }, [sortableContext]);

  if (!sortableContext) {
    console.warn("SortableHandle must be used within a SortableItem component");
    return <>{children}</>;
  }

  return (
    <GestureDetector gesture={sortableContext.panGestureHandler}>
      <Animated.View style={style}>{children}</Animated.View>
    </GestureDetector>
  );
};

function renderSortableContent(
  animatedStyle: StyleProp<ViewStyle>,
  dropIndicatorAnimatedStyle: StyleProp<ViewStyle>,
  customAnimatedStyle: SortableItemProps<unknown>["animatedStyle"],
  style: StyleProp<ViewStyle> | undefined,
  showDropIndicator: boolean | undefined,
  dropIndicatorStyle: StyleProp<ViewStyle> | undefined,
  children: React.ReactNode,
  panGestureHandler: SortableContextValue["panGestureHandler"],
  handlePanGestureHandler: SortableContextValue["panGestureHandler"],
  registerHandle: SortableContextValue["registerHandle"],
  onLayout?: (event: LayoutChangeEvent) => void
) {
  const content = (
    <Animated.View
      style={[animatedStyle, customAnimatedStyle]}
      onLayout={onLayout}
    >
      {showDropIndicator && (
        <Animated.View
          pointerEvents="none"
          style={[
            dropIndicatorAnimatedStyle,
            styles.dropIndicator,
            dropIndicatorStyle,
          ]}
        />
      )}
      <SortableContext.Provider
        value={{ panGestureHandler: handlePanGestureHandler, registerHandle }}
      >
        <Animated.View style={style}>{children}</Animated.View>
      </SortableContext.Provider>
    </Animated.View>
  );

  // Always render the outer GestureDetector to avoid mount/unmount cycles
  // that trigger Reanimated 4's "Tried to modify key handlerTag" warning.
  // The panGestureHandler is automatically disabled when a handle is registered.
  return (
    <GestureDetector gesture={panGestureHandler}>{content}</GestureDetector>
  );
}

interface VerticalSortableItemInnerProps<T> extends SortableItemProps<T> {
  autoScrollDirection: NonNullable<SortableItemProps<T>["autoScrollDirection"]>;
  lowerBound: NonNullable<SortableItemProps<T>["lowerBound"]>;
}

function VerticalSortableItemInner<T>({
  id,
  positions,
  positionSync,
  disabled,
  lowerBound,
  autoScrollDirection,
  itemsCount,
  itemHeight,
  containerHeight,
  isDynamicHeight = false,
  estimatedItemHeight,
  itemHeights,
  scheduleHeightUpdate,
  children,
  style,
  animatedStyle: customAnimatedStyle,
  showDropIndicator,
  dropIndicatorStyle,
  onMove,
  onDragStart,
  onDrop,
  onDragging,
  preDragDelay,
}: VerticalSortableItemInnerProps<T>) {
  const {
    animatedStyle,
    dropIndicatorAnimatedStyle,
    panGestureHandler,
    handlePanGestureHandler,
    registerHandle,
  } = useSortable<T>({
    id,
    positions,
    positionSync,
    disabled,
    lowerBound,
    autoScrollDirection,
    itemsCount,
    itemHeight,
    containerHeight,
    estimatedItemHeight,
    isDynamicHeight,
    itemHeights,
    onMove,
    onDragStart,
    onDrop,
    onDragging,
    preDragDelay,
  });

  // Handle layout measurement for dynamic heights
  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      if (!isDynamicHeight || !scheduleHeightUpdate) return;
      const { height } = event.nativeEvent.layout;
      scheduleHeightUpdate(id, height);
    },
    [id, isDynamicHeight, scheduleHeightUpdate]
  );

  return renderSortableContent(
    animatedStyle,
    dropIndicatorAnimatedStyle,
    customAnimatedStyle,
    style,
    showDropIndicator,
    dropIndicatorStyle,
    children,
    panGestureHandler,
    handlePanGestureHandler,
    registerHandle,
    isDynamicHeight && scheduleHeightUpdate ? handleLayout : undefined
  );
}

interface HorizontalSortableItemInnerProps<T> extends SortableItemProps<T> {
  autoScrollHorizontalDirection: NonNullable<
    SortableItemProps<T>["autoScrollHorizontalDirection"]
  >;
  itemWidth: number;
  leftBound: NonNullable<SortableItemProps<T>["leftBound"]>;
}

function HorizontalSortableItemInner<T>({
  id,
  positions,
  positionSync,
  disabled,
  leftBound,
  autoScrollHorizontalDirection,
  itemsCount,
  itemWidth,
  gap = 0,
  paddingHorizontal = 0,
  containerWidth,
  children,
  style,
  animatedStyle: customAnimatedStyle,
  showDropIndicator,
  dropIndicatorStyle,
  onMove,
  onDragStart,
  onDrop,
  onDraggingHorizontal,
  preDragDelay,
}: HorizontalSortableItemInnerProps<T>) {
  const {
    animatedStyle,
    dropIndicatorAnimatedStyle,
    panGestureHandler,
    handlePanGestureHandler,
    registerHandle,
  } = useHorizontalSortable<T>({
    id,
    positions,
    positionSync,
    disabled,
    leftBound,
    autoScrollDirection: autoScrollHorizontalDirection,
    itemsCount,
    itemWidth,
    gap,
    paddingHorizontal,
    containerWidth,
    onMove,
    onDragStart,
    onDrop,
    onDragging: onDraggingHorizontal,
    preDragDelay,
  });

  return renderSortableContent(
    animatedStyle,
    dropIndicatorAnimatedStyle,
    customAnimatedStyle,
    style,
    showDropIndicator,
    dropIndicatorStyle,
    children,
    panGestureHandler,
    handlePanGestureHandler,
    registerHandle
  );
}

/**
 * A component for individual items within a sortable list.
 *
 * SortableItem provides the drag-and-drop functionality for individual list items,
 * handling gesture recognition, position animations, and reordering logic.
 * It can be used with or without drag handles for different interaction patterns.
 *
 * Supports both vertical (default) and horizontal directions automatically based
 * on the direction prop passed from the parent Sortable component.
 *
 * @template T - The type of data associated with this sortable item
 * @param props - Configuration props for the sortable item
 */
export function SortableItem<T>({
  direction = SortableDirection.Vertical,
  ...props
}: SortableItemProps<T>) {
  const listContext = useContext(SortableListContext);
  const resolvedProps = {
    ...props,
    positionSync: props.positionSync ?? listContext?.positionSync,
    showDropIndicator:
      props.showDropIndicator ?? listContext?.showDropIndicator ?? false,
    dropIndicatorStyle:
      props.dropIndicatorStyle ?? listContext?.dropIndicatorStyle,
  };

  // Validate required props based on direction
  if (
    direction === SortableDirection.Vertical &&
    !props.isDynamicHeight &&
    !props.itemHeight &&
    (!props.lowerBound || !props.autoScrollDirection)
  ) {
    throw new Error(
      "itemHeight (or isDynamicHeight), lowerBound, and autoScrollDirection are required for vertical direction"
    );
  }
  if (
    direction === SortableDirection.Horizontal &&
    (!props.itemWidth ||
      !props.leftBound ||
      !props.autoScrollHorizontalDirection)
  ) {
    throw new Error(
      "itemWidth, leftBound, and autoScrollHorizontalDirection are required for horizontal direction"
    );
  }

  if (direction === SortableDirection.Horizontal) {
    return (
      <HorizontalSortableItemInner
        {...resolvedProps}
        direction={direction}
        itemWidth={props.itemWidth!}
        leftBound={props.leftBound!}
        autoScrollHorizontalDirection={props.autoScrollHorizontalDirection!}
      />
    );
  }

  return (
    <VerticalSortableItemInner
      {...resolvedProps}
      direction={direction}
      lowerBound={props.lowerBound!}
      autoScrollDirection={props.autoScrollDirection!}
    />
  );
}

// Attach the SortableHandle as a static property
SortableItem.Handle = SortableHandle;

const styles = {
  dropIndicator: {
    backgroundColor: "#3B82F6",
    borderRadius: 999,
  } satisfies ViewStyle,
};
