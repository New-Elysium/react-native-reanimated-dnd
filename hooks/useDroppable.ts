import { useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { LayoutChangeEvent, StyleSheet } from "react-native";
import Animated, {
  useAnimatedRef,
  useSharedValue,
} from "react-native-reanimated";
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets";
import {
  DropAlignment,
  DropOffset,
  SlotsContext,
  SlotsContextValue,
} from "../types/context";
import { UseDroppableOptions, UseDroppableReturn } from "../types/droppable";
import { safeMeasure } from "./safeMeasure";

let _nextDroppableId = 1;
const _getUniqueDroppableId = (): number => {
  return _nextDroppableId++;
};

/**
 * A hook for creating drop zones that can receive draggable items.
 *
 * This hook handles the registration of drop zones, collision detection with draggable items,
 * visual feedback during hover states, and proper positioning of dropped items within the zone.
 * It integrates seamlessly with the drag-and-drop context to provide a complete solution.
 *
 * @template TData - The type of data that can be dropped on this droppable
 * @param options - Configuration options for the droppable behavior
 * @returns Object containing view props, active state, and internal references
 *
 * @example
 * Basic drop zone:
 * ```typescript
 * import { useDroppable } from './hooks/useDroppable';
 *
 * function BasicDropZone() {
 *   const { viewProps, isActive } = useDroppable({
 *     onDrop: (data) => {
 *       console.log('Item dropped:', data);
 *       // Handle the dropped item
 *     }
 *   });
 *
 *   return (
 *     <Animated.View
 *       {...viewProps}
 *       style={[
 *         styles.dropZone,
 *         viewProps.style, // Important: include the active style
 *         isActive && styles.highlighted
 *       ]}
 *     >
 *       <Text>Drop items here</Text>
 *     </Animated.View>
 *   );
 * }
 * ```
 *
 * @example
 * Drop zone with custom alignment and capacity:
 * ```typescript
 * function TaskColumn() {
 *   const [tasks, setTasks] = useState<Task[]>([]);
 *
 *   const { viewProps, isActive } = useDroppable({
 *     droppableId: 'in-progress-column',
 *     onDrop: (task: Task) => {
 *       setTasks(prev => [...prev, task]);
 *       updateTaskStatus(task.id, 'in-progress');
 *     },
 *     dropAlignment: 'top-center',
 *     dropOffset: { x: 0, y: 10 },
 *     capacity: 10, // Max 10 tasks in this column
 *     activeStyle: {
 *       backgroundColor: 'rgba(59, 130, 246, 0.1)',
 *       borderColor: '#3b82f6',
 *       borderWidth: 2,
 *       borderStyle: 'dashed'
 *     }
 *   });
 *
 *   return (
 *     <Animated.View {...viewProps} style={[styles.column, viewProps.style]}>
 *       <Text style={styles.columnTitle}>In Progress ({tasks.length}/10)</Text>
 *       {tasks.map(task => (
 *         <TaskCard key={task.id} task={task} />
 *       ))}
 *       {isActive && (
 *         <Text style={styles.dropHint}>Release to add task</Text>
 *       )}
 *     </Animated.View>
 *   );
 * }
 * ```
 *
 * @example
 * Conditional drop zone with validation:
 * ```typescript
 * function RestrictedDropZone() {
 *   const [canAcceptItems, setCanAcceptItems] = useState(true);
 *
 *   const { viewProps, isActive } = useDroppable({
 *     onDrop: (data: FileData) => {
 *       if (data.type === 'image' && data.size < 5000000) {
 *         uploadFile(data);
 *       } else {
 *         showError('Only images under 5MB allowed');
 *       }
 *     },
 *     dropDisabled: !canAcceptItems,
 *     onActiveChange: (active) => {
 *       if (active) {
 *         setHoverFeedback('Drop your image here');
 *       } else {
 *         setHoverFeedback('');
 *       }
 *     },
 *     activeStyle: {
 *       backgroundColor: canAcceptItems ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
 *       borderColor: canAcceptItems ? '#22c55e' : '#ef4444'
 *     }
 *   });
 *
 *   return (
 *     <Animated.View
 *       {...viewProps}
 *       style={[
 *         styles.uploadZone,
 *         viewProps.style,
 *         !canAcceptItems && styles.disabled
 *       ]}
 *     >
 *       <Text>
 *         {canAcceptItems ? 'Drop images here' : 'Upload disabled'}
 *       </Text>
 *       {isActive && <Text>Release to upload</Text>}
 *     </Animated.View>
 *   );
 * }
 * ```
 *
 * @see {@link DropAlignment} for alignment options
 * @see {@link DropOffset} for offset configuration
 * @see {@link UseDroppableOptions} for configuration options
 * @see {@link UseDroppableReturn} for return value details
 */
export const useDroppable = <TData = unknown>(
  options: UseDroppableOptions<TData>
): UseDroppableReturn => {
  const {
    onDrop,
    dropDisabled,
    onActiveChange,
    dropAlignment,
    dropOffset,
    activeStyle,
    draggingStyle,
    droppableId,
    capacity,
  } = options;

  // Create animated ref first
  const nodeReady = useSharedValue(false);
  const animatedViewRef = useAnimatedRef<Animated.View>();

  const id = useRef(_getUniqueDroppableId()).current;
  const stringId = useRef(droppableId || `droppable-${id}`).current;
  const instanceId = useRef(
    `droppable-${id}-${Math.random().toString(36).substr(2, 9)}`
  ).current;

  const {
    register,
    unregister,
    isRegistered,
    activeHoverSlotId: contextActiveHoverSlotId,
    isDragging,
    hasAvailableCapacity,
    registerPositionUpdateListener,
    unregisterPositionUpdateListener,
  } = useContext(SlotsContext) as SlotsContextValue<TData>;

  const canAcceptDrop = !dropDisabled && hasAvailableCapacity(stringId);
  const isActive = contextActiveHoverSlotId === id && canAcceptDrop;

  // Flattening the styles together preserves React Native's normal precedence:
  // activeStyle replaces matching draggingStyle properties, including transform.
  const combinedActiveStyle = useMemo(() => {
    const shouldApplyDraggingStyle =
      isDragging && canAcceptDrop && draggingStyle;
    const shouldApplyActiveStyle = isActive && activeStyle;

    if (!shouldApplyDraggingStyle && !shouldApplyActiveStyle) {
      return undefined;
    }

    return StyleSheet.flatten([
      shouldApplyDraggingStyle && draggingStyle,
      shouldApplyActiveStyle && activeStyle,
    ]);
  }, [isActive, activeStyle, isDragging, canAcceptDrop, draggingStyle]);

  useEffect(() => {
    onActiveChange?.(isActive);
  }, [isActive, onActiveChange]);

  // Keep the JS callback on the RN thread and only pass serializable measurements
  // across the worklet boundary.
  const registerWithMeasurement = useCallback(
    (pageX: number, pageY: number, width: number, height: number) => {
      register(id, {
        id: droppableId || `droppable-${id}`,
        x: pageX,
        y: pageY,
        width,
        height,
        onDrop,
        dropAlignment: dropAlignment || "center",
        dropOffset: dropOffset || { x: 0, y: 0 },
        capacity,
      });
    },
    [id, droppableId, onDrop, register, dropAlignment, dropOffset, capacity]
  );

  const updateDroppablePosition = useCallback(() => {
    scheduleOnUI(() => {
      "worklet";
      if (!nodeReady.value) {
        return;
      }

      const measurement = safeMeasure(animatedViewRef);
      if (measurement === null) {
        return;
      }

      if (measurement.width > 0 && measurement.height > 0) {
        scheduleOnRN(
          registerWithMeasurement,
          measurement.pageX,
          measurement.pageY,
          measurement.width,
          measurement.height
        );
      }
    });
  }, [animatedViewRef, registerWithMeasurement]);

  const handleLayoutHandler = useCallback(
    (_event: LayoutChangeEvent) => {
      scheduleOnUI(() => {
        "worklet";
        nodeReady.value = true;
      });

      updateDroppablePosition();
    },
    [nodeReady, updateDroppablePosition]
  );

  useEffect(() => {
    registerPositionUpdateListener(instanceId, updateDroppablePosition);
    return () => {
      unregisterPositionUpdateListener(instanceId);
    };
  }, [
    instanceId,
    registerPositionUpdateListener,
    unregisterPositionUpdateListener,
    updateDroppablePosition,
  ]);

  useEffect(() => {
    if (dropDisabled) {
      unregister(id);
    } else {
      // Initial registration or re-registration if it became enabled
      updateDroppablePosition();
    }
    // Not relying on isRegistered here for initial registration to ensure it always attempts
    // to register if not disabled. The measure call inside updateDroppablePosition is the gatekeeper.
  }, [
    dropDisabled,
    id,
    unregister, // only unregister is truly a dependency for the disabled case
    updateDroppablePosition, // for the enabled case
  ]);

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      unregister(id);
    };
  }, [id, unregister]);

  return {
    viewProps: {
      onLayout: handleLayoutHandler,
      style: combinedActiveStyle,
    },
    isActive,
    isDragging,
    activeStyle,
    animatedViewRef,
  };
};
