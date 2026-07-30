// hooks/useDraggable.ts
import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { LayoutChangeEvent } from "react-native";
import Animated, {
  AnimatedStyle,
  useAnimatedReaction,
  useAnimatedRef,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import {
  Gesture,
  GestureType,
  PanGestureHandlerEventPayload,
} from "react-native-gesture-handler";
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets";
import {
  DropAlignment,
  DropOffset,
  DropSlot,
  SlotsContext,
  SlotsContextValue,
} from "../types/context";
import {
  AnimationFunction,
  CollisionAlgorithm,
  DraggableState,
  UseDraggableOptions,
  UseDraggableReturn,
} from "../types/draggable";
import { safeMeasure } from "./safeMeasure";

/**
 * A powerful hook for creating draggable components with advanced features like
 * collision detection, bounded dragging, axis constraints, and custom animations.
 *
 * This hook provides the core functionality for drag-and-drop interactions,
 * handling gesture recognition, position tracking, collision detection with drop zones,
 * and smooth animations.
 *
 * @template TData - The type of data associated with the draggable item
 * @param options - Configuration options for the draggable behavior
 * @returns Object containing props, gesture handlers, and state for the draggable component
 *
 * @example
 * Basic draggable component:
 * ```typescript
 * import { useDraggable } from './hooks/useDraggable';
 *
 * function MyDraggable() {
 *   const { animatedViewProps, gesture, state } = useDraggable({
 *     data: { id: '1', name: 'Draggable Item' },
 *     onDragStart: (data) => console.log('Started dragging:', data.name),
 *     onDragEnd: (data) => console.log('Finished dragging:', data.name),
 *   });
 *
 *   return (
 *     <GestureDetector gesture={gesture}>
 *       <Animated.View {...animatedViewProps}>
 *         <Text>Drag me!</Text>
 *       </Animated.View>
 *     </GestureDetector>
 *   );
 * }
 * ```
 *
 * @example
 * Draggable with custom animation and bounds:
 * ```typescript
 * function BoundedDraggable() {
 *   const boundsRef = useRef<View>(null);
 *
 *   const { animatedViewProps, gesture } = useDraggable({
 *     data: { id: '2', type: 'bounded' },
 *     dragBoundsRef: boundsRef,
 *     dragAxis: 'x', // Only horizontal movement
 *     animationFunction: (toValue) => {
 *       'worklet';
 *       return withTiming(toValue, { duration: 300 });
 *     },
 *     collisionAlgorithm: 'center',
 *   });
 *
 *   return (
 *     <View ref={boundsRef} style={styles.container}>
 *       <GestureDetector gesture={gesture}>
 *         <Animated.View {...animatedViewProps}>
 *           <Text>Bounded horizontal draggable</Text>
 *         </Animated.View>
 *       </GestureDetector>
 *     </View>
 *   );
 * }
 * ```
 *
 * @example
 * Draggable with state tracking:
 * ```typescript
 * function StatefulDraggable() {
 *   const [dragState, setDragState] = useState(DraggableState.IDLE);
 *
 *   const { animatedViewProps, gesture } = useDraggable({
 *     data: { id: '3', status: 'active' },
 *     onStateChange: setDragState,
 *     onDragging: ({ x, y, tx, ty }) => {
 *       console.log(`Position: (${x + tx}, ${y + ty})`);
 *     },
 *   });
 *
 *   return (
 *     <GestureDetector gesture={gesture}>
 *       <Animated.View
 *         {...animatedViewProps}
 *         style={[
 *           animatedViewProps.style,
 *           { opacity: dragState === DraggableState.DRAGGING ? 0.7 : 1 }
 *         ]}
 *       >
 *         <Text>State: {dragState}</Text>
 *       </Animated.View>
 *     </GestureDetector>
 *   );
 * }
 * ```
 *
 * @see {@link DraggableState} for state management
 * @see {@link CollisionAlgorithm} for collision detection options
 * @see {@link AnimationFunction} for custom animations
 * @see {@link UseDraggableOptions} for configuration options
 * @see {@link UseDraggableReturn} for return value details
 */

export const useDraggable = <TData = unknown>(
  options: UseDraggableOptions<TData>
): UseDraggableReturn => {
  const {
    data,
    draggableId,
    dragDisabled = false,
    preDragDelay = 0,
    onDragStart,
    onDragEnd,
    onDragging,
    onStateChange,
    animationFunction,
    dragBoundsRef,
    dragAxis = "both",
    collisionAlgorithm = "intersect",
    snapBackAfterDrop = false,
  } = options;

  // Create animated ref first
  const animatedViewRef = useAnimatedRef<Animated.View>();

  // Add state management
  const [state, setState] = useState<DraggableState>(DraggableState.IDLE);
  const [hasHandle, setHasHandle] = useState(false);

  const registerHandle = useCallback((registered: boolean) => {
    setHasHandle(registered);
  }, []);

  useEffect(() => {
    onStateChange?.(state);
  }, [state, onStateChange]);

  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);
  const dragDisabledShared = useSharedValue(dragDisabled);
  const dragAxisShared = useSharedValue(dragAxis);
  const preDragDelayShared = useSharedValue(preDragDelay);
  const nodeReady = useSharedValue(false);
  const dragStarted = useSharedValue(false);

  const originX = useSharedValue(0);
  const originY = useSharedValue(0);
  const itemW = useSharedValue(0);
  const itemH = useSharedValue(0);
  const isOriginSet = useRef(false);
  const internalDraggableId = useRef(
    draggableId || `draggable-${Math.random().toString(36).substr(2, 9)}`
  ).current;

  const boundsX = useSharedValue(0);
  const boundsY = useSharedValue(0);
  const boundsWidth = useSharedValue(0);
  const boundsHeight = useSharedValue(0);
  const boundsAreSet = useSharedValue(false);

  const {
    getSlots,
    setActiveHoverSlot,
    registerPositionUpdateListener,
    unregisterPositionUpdateListener,
    registerDroppedItem,
    unregisterDroppedItem,
    hasAvailableCapacity,
    onDragging: contextOnDragging,
    onDragStart: contextOnDragStart,
    onDragEnd: contextOnDragEnd,
  } = useContext(SlotsContext) as SlotsContextValue<TData>;
  const latestDataRef = useRef(data);
  const contextOnDragEndRef = useRef(contextOnDragEnd);

  useEffect(() => {
    latestDataRef.current = data;
    contextOnDragEndRef.current = contextOnDragEnd;
  }, [contextOnDragEnd, data]);

  useEffect(() => {
    preDragDelayShared.value = preDragDelay;
  }, [preDragDelay, preDragDelayShared]);

  useEffect(() => {
    dragDisabledShared.value = dragDisabled;
  }, [dragDisabled, dragDisabledShared]);

  useEffect(() => {
    dragAxisShared.value = dragAxis;
  }, [dragAxis, dragAxisShared]);

  const updateDraggablePosition = useCallback(() => {
    scheduleOnUI(() => {
      "worklet";
      if (!nodeReady.value) {
        return;
      }

      const measurement = safeMeasure(animatedViewRef);
      if (measurement === null) {
        return;
      }

      const currentTx = tx.value;
      const currentTy = ty.value;
      //only update the origin if the tx and ty are 0
      if (currentTx === 0 && currentTy === 0) {
        const newOriginX = measurement.pageX - currentTx;
        const newOriginY = measurement.pageY - currentTy;

        originX.value = newOriginX;
        originY.value = newOriginY;
      }
      itemW.value = measurement.width;
      itemH.value = measurement.height;

      if (!isOriginSet.current) {
        isOriginSet.current = true;
      }
    });
  }, [animatedViewRef, originX, originY, itemW, itemH, tx, ty]);

  // Worklet version for use within UI thread contexts
  const updateDraggablePositionWorklet = useCallback(() => {
    "worklet";
    if (!nodeReady.value) {
      return;
    }

    const measurement = safeMeasure(animatedViewRef);
    if (measurement === null) {
      return;
    }

    const currentTx = tx.value;
    const currentTy = ty.value;
    //only update the origin if the tx and ty are 0
    if (currentTx === 0 && currentTy === 0) {
      const newOriginX = measurement.pageX - currentTx;
      const newOriginY = measurement.pageY - currentTy;

      originX.value = newOriginX;
      originY.value = newOriginY;
    }
    itemW.value = measurement.width;
    itemH.value = measurement.height;

    if (!isOriginSet.current) {
      isOriginSet.current = true;
    }
  }, [animatedViewRef, originX, originY, itemW, itemH, tx, ty]);

  const updateBounds = useCallback(() => {
    const currentBoundsView = dragBoundsRef?.current;
    if (currentBoundsView) {
      currentBoundsView.measure((_x, _y, width, height, pageX, pageY) => {
        if (
          typeof pageX === "number" &&
          typeof pageY === "number" &&
          width > 0 &&
          height > 0
        ) {
          scheduleOnUI(() => {
            "worklet";
            boundsX.value = pageX;
            boundsY.value = pageY;
            boundsWidth.value = width;
            boundsHeight.value = height;
            if (!boundsAreSet.value) {
              boundsAreSet.value = true;
            }
          });
        } else {
          console.warn(
            "useDraggable: dragBoundsRef measurement failed or returned invalid dimensions. Bounds may be stale or item unbounded."
          );
        }
      });
    } else {
      scheduleOnUI(() => {
        "worklet";
        if (boundsAreSet.value) {
          boundsAreSet.value = false;
        }
      });
    }
  }, [
    dragBoundsRef,
    boundsX,
    boundsY,
    boundsWidth,
    boundsHeight,
    boundsAreSet,
  ]);

  useEffect(() => {
    const handlePositionUpdate = () => {
      updateDraggablePosition();
      updateBounds();
    };
    registerPositionUpdateListener(internalDraggableId, handlePositionUpdate);
    return () => {
      unregisterPositionUpdateListener(internalDraggableId);
    };
  }, [
    internalDraggableId,
    registerPositionUpdateListener,
    unregisterPositionUpdateListener,
    updateDraggablePosition,
    updateBounds,
  ]);

  useEffect(() => {
    updateBounds();
  }, [updateBounds]);

  const handleLayoutHandler = useCallback(
    (_event: LayoutChangeEvent) => {
      scheduleOnUI(() => {
        "worklet";
        nodeReady.value = true;
      });

      updateDraggablePosition();
    },
    [nodeReady, updateDraggablePosition]
  );

  const animateDragEndPosition = useCallback(
    (targetXValue: number, targetYValue: number) => {
      "worklet";
      if (animationFunction) {
        tx.value = animationFunction(targetXValue);
        ty.value = animationFunction(targetYValue);
      } else {
        tx.value = withSpring(targetXValue);
        ty.value = withSpring(targetYValue);
      }
    },
    [animationFunction, tx, ty]
  );

  const finishDragLifecycle = useCallback(
    (draggableData: TData) => {
      onDragEnd?.(draggableData);
      contextOnDragEnd?.(draggableData, internalDraggableId);
    },
    [onDragEnd, contextOnDragEnd, internalDraggableId]
  );

  const performCollisionCheck = useCallback(
    (
      draggableX: number,
      draggableY: number,
      draggableW: number,
      draggableH: number,
      slot: DropSlot<TData>,
      algo: CollisionAlgorithm
    ): boolean => {
      if (algo === "intersect") {
        return (
          draggableX < slot.x + slot.width &&
          draggableX + draggableW > slot.x &&
          draggableY < slot.y + slot.height &&
          draggableY + draggableH > slot.y
        );
      } else if (algo === "contain") {
        return (
          draggableX >= slot.x &&
          draggableX + draggableW <= slot.x + slot.width &&
          draggableY >= slot.y &&
          draggableY + draggableH <= slot.y + slot.height
        );
      } else {
        const draggableCenterX = draggableX + draggableW / 2;
        const draggableCenterY = draggableY + draggableH / 2;
        return (
          draggableCenterX >= slot.x &&
          draggableCenterX <= slot.x + slot.width &&
          draggableCenterY >= slot.y &&
          draggableCenterY <= slot.y + slot.height
        );
      }
    },
    []
  );

  const processDropAndAnimate = useCallback(
    (
      currentTxVal: number,
      currentTyVal: number,
      draggableData: TData,
      currentOriginX: number,
      currentOriginY: number,
      currentItemW: number,
      currentItemH: number
    ) => {
      const slots = getSlots();
      const currentDraggableX = currentOriginX + currentTxVal;
      const currentDraggableY = currentOriginY + currentTyVal;

      let hitSlotData: DropSlot<TData> | null = null;
      let hitSlotId: number | null = null;
      let hitSlotPriority = Number.NEGATIVE_INFINITY;

      for (const key in slots) {
        const slotId = parseInt(key, 10);
        const s = slots[slotId];

        const isCollision = performCollisionCheck(
          currentDraggableX,
          currentDraggableY,
          currentItemW,
          currentItemH,
          s,
          collisionAlgorithm
        );

        if (isCollision) {
          const hasCapacity = hasAvailableCapacity(s.id);
          const priority = s.priority ?? 0;

          if (hasCapacity && priority > hitSlotPriority) {
            hitSlotData = s;
            hitSlotId = slotId;
            hitSlotPriority = priority;
          }
        }
      }

      let finalTxValue: number;
      let finalTyValue: number;

      if (hitSlotData && hitSlotId !== null) {
        if (hitSlotData.onDrop) {
          hitSlotData.onDrop(draggableData);
        }

        if (snapBackAfterDrop) {
          scheduleOnRN(unregisterDroppedItem, internalDraggableId);
          scheduleOnRN(setState, DraggableState.IDLE);
        } else {
          scheduleOnRN(
            registerDroppedItem,
            internalDraggableId,
            hitSlotData.id,
            draggableData
          );
          scheduleOnRN(setState, DraggableState.DROPPED);
        }

        const alignment: DropAlignment = hitSlotData.dropAlignment || "center";
        const offset: DropOffset = hitSlotData.dropOffset || { x: 0, y: 0 };

        let targetX = 0;
        let targetY = 0;

        switch (alignment) {
          case "top-left":
            targetX = hitSlotData.x;
            targetY = hitSlotData.y;
            break;
          case "top-center":
            targetX = hitSlotData.x + hitSlotData.width / 2 - currentItemW / 2;
            targetY = hitSlotData.y;
            break;
          case "top-right":
            targetX = hitSlotData.x + hitSlotData.width - currentItemW;
            targetY = hitSlotData.y;
            break;
          case "center-left":
            targetX = hitSlotData.x;
            targetY = hitSlotData.y + hitSlotData.height / 2 - currentItemH / 2;
            break;
          case "center":
            targetX = hitSlotData.x + hitSlotData.width / 2 - currentItemW / 2;
            targetY = hitSlotData.y + hitSlotData.height / 2 - currentItemH / 2;
            break;
          case "center-right":
            targetX = hitSlotData.x + hitSlotData.width - currentItemW;
            targetY = hitSlotData.y + hitSlotData.height / 2 - currentItemH / 2;
            break;
          case "bottom-left":
            targetX = hitSlotData.x;
            targetY = hitSlotData.y + hitSlotData.height - currentItemH;
            break;
          case "bottom-center":
            targetX = hitSlotData.x + hitSlotData.width / 2 - currentItemW / 2;
            targetY = hitSlotData.y + hitSlotData.height - currentItemH;
            break;
          case "bottom-right":
            targetX = hitSlotData.x + hitSlotData.width - currentItemW;
            targetY = hitSlotData.y + hitSlotData.height - currentItemH;
            break;
          default:
            targetX = hitSlotData.x + hitSlotData.width / 2 - currentItemW / 2;
            targetY = hitSlotData.y + hitSlotData.height / 2 - currentItemH / 2;
        }

        const draggableTargetX = targetX + offset.x;
        const draggableTargetY = targetY + offset.y;

        finalTxValue = snapBackAfterDrop
          ? 0
          : draggableTargetX - currentOriginX;
        finalTyValue = snapBackAfterDrop
          ? 0
          : draggableTargetY - currentOriginY;
      } else {
        // No hit slot or no capacity available - reset to original position and set state to IDLE
        finalTxValue = 0;
        finalTyValue = 0;

        scheduleOnRN(setState, DraggableState.IDLE);
        scheduleOnRN(unregisterDroppedItem, internalDraggableId);
      }

      scheduleOnUI(animateDragEndPosition, finalTxValue, finalTyValue);
      finishDragLifecycle(draggableData);
    },
    [
      getSlots,
      animateDragEndPosition,
      collisionAlgorithm,
      performCollisionCheck,
      setState,
      internalDraggableId,
      registerDroppedItem,
      unregisterDroppedItem,
      hasAvailableCapacity,
      snapBackAfterDrop,
      finishDragLifecycle,
    ]
  );

  const updateHoverState = useCallback(
    (
      currentTxVal: number,
      currentTyVal: number,
      currentOriginX: number,
      currentOriginY: number,
      currentItemW: number,
      currentItemH: number
    ) => {
      const slots = getSlots();
      const currentDraggableX = currentOriginX + currentTxVal;
      const currentDraggableY = currentOriginY + currentTyVal;

      let newHoveredSlotId: number | null = null;
      let hoveredPriority = Number.NEGATIVE_INFINITY;
      for (const key in slots) {
        const slotId = parseInt(key, 10);
        const s = slots[slotId];

        const isCollision = performCollisionCheck(
          currentDraggableX,
          currentDraggableY,
          currentItemW,
          currentItemH,
          s,
          collisionAlgorithm
        );

        if (isCollision && (s.priority ?? 0) > hoveredPriority) {
          newHoveredSlotId = slotId;
          hoveredPriority = s.priority ?? 0;
        }
      }
      setActiveHoverSlot(newHoveredSlotId);
    },
    [getSlots, setActiveHoverSlot, collisionAlgorithm, performCollisionCheck]
  );

  const { gesture, handleGesture } = React.useMemo<{
    gesture: GestureType;
    handleGesture: GestureType;
  }>(() => {
    const createPanGesture = () =>
      Gesture.Pan()
        .activateAfterLongPress(preDragDelay)
        .shouldCancelWhenOutside(false)
        // We use onStart to detect the initial drag start after the preDragDelay
        .onStart(() => {
          "worklet";
          if (!nodeReady.value) return;
          //first update the position
          updateDraggablePositionWorklet();
          if (dragDisabledShared.value) return;
          dragStarted.value = true;
          offsetX.value = tx.value;
          offsetY.value = ty.value;
          // Update state to DRAGGING when drag begins
          scheduleOnRN(setState, DraggableState.DRAGGING);
          if (onDragStart) scheduleOnRN(onDragStart, data);
          if (contextOnDragStart) {
            scheduleOnRN(contextOnDragStart, data, internalDraggableId);
          }
        })
        .onUpdate((event: PanGestureHandlerEventPayload) => {
          "worklet";
          if (dragDisabledShared.value) return;
          let newTx = offsetX.value + event.translationX;
          let newTy = offsetY.value + event.translationY;
          if (boundsAreSet.value) {
            const currentItemW = itemW.value;
            const currentItemH = itemH.value;
            const minTx = boundsX.value - originX.value;
            const maxTx =
              boundsX.value + boundsWidth.value - originX.value - currentItemW;
            const minTy = boundsY.value - originY.value;
            const maxTy =
              boundsY.value + boundsHeight.value - originY.value - currentItemH;
            newTx = Math.max(minTx, Math.min(newTx, maxTx));
            newTy = Math.max(minTy, Math.min(newTy, maxTy));
          }
          if (dragAxisShared.value === "x") {
            tx.value = newTx;
          } else if (dragAxisShared.value === "y") {
            ty.value = newTy;
          } else {
            tx.value = newTx;
            ty.value = newTy;
          }
          if (onDragging) {
            scheduleOnRN(onDragging, {
              x: originX.value,
              y: originY.value,
              tx: tx.value,
              ty: ty.value,
              width: itemW.value,
              height: itemH.value,
              itemData: data,
            });
          }
          if (contextOnDragging) {
            scheduleOnRN(contextOnDragging, {
              x: originX.value,
              y: originY.value,
              tx: tx.value,
              ty: ty.value,
              width: itemW.value,
              height: itemH.value,
              itemData: data,
            });
          }
          scheduleOnRN(
            updateHoverState,
            tx.value,
            ty.value,
            originX.value,
            originY.value,
            itemW.value,
            itemH.value
          );
        })
        .onFinalize((_event, success) => {
          "worklet";
          if (!dragStarted.value) return;
          dragStarted.value = false;

          if (success) {
            scheduleOnRN(
              processDropAndAnimate,
              tx.value,
              ty.value,
              data,
              originX.value,
              originY.value,
              itemW.value,
              itemH.value
            );
          } else {
            animateDragEndPosition(0, 0);
            scheduleOnRN(setState, DraggableState.IDLE);
            scheduleOnRN(unregisterDroppedItem, internalDraggableId);
            scheduleOnRN(finishDragLifecycle, data);
          }

          scheduleOnRN(setActiveHoverSlot, null);
        });

    return {
      gesture: createPanGesture().enabled(!dragDisabled && !hasHandle),
      handleGesture: createPanGesture().enabled(!dragDisabled),
    };
  }, [
    dragDisabledShared,
    offsetX,
    offsetY,
    tx,
    ty,
    originX,
    originY,
    itemW,
    itemH,
    onDragStart,
    data,
    processDropAndAnimate,
    updateHoverState,
    setActiveHoverSlot,
    animationFunction,
    onDragging,
    boundsAreSet,
    boundsX,
    boundsY,
    boundsWidth,
    boundsHeight,
    dragAxisShared,
    setState,
    updateDraggablePositionWorklet,
    contextOnDragging,
    contextOnDragStart,
    nodeReady,
    preDragDelay,
    dragStarted,
    internalDraggableId,
    animateDragEndPosition,
    unregisterDroppedItem,
    finishDragLifecycle,
    dragDisabled,
    hasHandle,
  ]);

  const animatedStyleProp = useAnimatedStyle(() => {
    "worklet";
    return {
      transform: [{ translateX: tx.value }, { translateY: ty.value }] as const,
      zIndex: dragStarted.value ? 1000 : 0,
      elevation: dragStarted.value ? 1000 : 0,
    };
  }, [tx, ty, dragStarted]);

  // Replace the React useEffect with useAnimatedReaction to properly handle shared values
  useAnimatedReaction(
    () => {
      // This runs on the UI thread and detects when position is back to origin
      // and state needs to be reset
      return {
        txValue: tx.value,
        tyValue: ty.value,
        isZero: tx.value === 0 && ty.value === 0,
      };
    },
    (result, previous) => {
      // Only trigger when values change to zero (returned to original position)
      if (result.isZero && previous && !previous.isZero) {
        // Use scheduleOnRN to call setState from the UI thread.
        scheduleOnRN(setState, DraggableState.IDLE);
        // When returning to origin position, we know we're no longer dropped
        scheduleOnRN(unregisterDroppedItem, internalDraggableId);
      }
    },
    [setState, unregisterDroppedItem, internalDraggableId]
  );

  // Clean up on unmount
  useEffect(() => {
    return () => {
      // Clean up any registered drops when unmounting
      unregisterDroppedItem(internalDraggableId);
      contextOnDragEndRef.current?.(latestDataRef.current, internalDraggableId);
    };
  }, [internalDraggableId, unregisterDroppedItem]);

  return {
    animatedViewProps: {
      style: animatedStyleProp,
      onLayout: handleLayoutHandler,
    },
    gesture,
    handleGesture,
    state,
    animatedViewRef,
    hasHandle,
    registerHandle,
  };
};
