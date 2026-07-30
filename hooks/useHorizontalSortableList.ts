import { useRef, useCallback, useEffect, useMemo } from "react";
import {
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useSharedValue,
} from "react-native-reanimated";
import { listToObject, getContentWidth } from "../components/sortableUtils";
import { HorizontalScrollDirection } from "../types/sortable";
import { DropProviderRef } from "../types/context";
import { scheduleOnUI } from "react-native-worklets";
import {
  SortablePositionSync,
  UseHorizontalSortableListOptions,
  UseHorizontalSortableListReturn,
} from "../types/sortable";

/**
 * A hook for managing horizontal sortable lists with drag-and-drop reordering capabilities.
 *
 * This hook provides the foundational state management and utilities needed to create
 * horizontal sortable lists. It handles position tracking, scroll synchronization,
 * auto-scrolling, gap management, and provides helper functions for individual sortable items.
 *
 * @template TData - The type of data items in the sortable list (must extend `{ id: string }`)
 * @param options - Configuration options for the horizontal sortable list
 * @returns Object containing shared values, refs, handlers, and utilities for the horizontal sortable list
 *
 * @example
 * Basic horizontal sortable list setup:
 * ```typescript
 * import { useHorizontalSortableList } from './hooks/useHorizontalSortableList';
 * import { HorizontalSortableItem } from './components/HorizontalSortableItem';
 *
 * interface Tag {
 *   id: string;
 *   label: string;
 *   color: string;
 * }
 *
 * function TagList() {
 *   const [tags, setTags] = useState<Tag[]>([
 *     { id: '1', label: 'React', color: '#61dafb' },
 *     { id: '2', label: 'TypeScript', color: '#3178c6' },
 *     { id: '3', label: 'React Native', color: '#0fa5e9' }
 *   ]);
 *
 *   const {
 *     scrollViewRef,
 *     dropProviderRef,
 *     handleScroll,
 *     handleScrollEnd,
 *     contentWidth,
 *     getItemProps,
 *   } = useHorizontalSortableList({
 *     data: tags,
 *     itemWidth: 120,
 *     gap: 10,
 *     paddingHorizontal: 16,
 *   });
 *
 *   return (
 *     <GestureHandlerRootView style={styles.container}>
 *       <DropProvider ref={dropProviderRef}>
 *         <Animated.ScrollView
 *           ref={scrollViewRef}
 *           onScroll={handleScroll}
 *           scrollEventThrottle={16}
 *           horizontal={true}
 *           style={styles.scrollView}
 *           contentContainerStyle={{ width: contentWidth }}
 *           onScrollEndDrag={handleScrollEnd}
 *           onMomentumScrollEnd={handleScrollEnd}
 *           showsHorizontalScrollIndicator={false}
 *         >
 *           {tags.map((tag, index) => {
 *             const itemProps = getItemProps(tag, index);
 *             return (
 *               <HorizontalSortableItem key={tag.id} {...itemProps}>
 *                 <View style={[styles.tagItem, { backgroundColor: tag.color }]}>
 *                   <Text style={styles.tagText}>{tag.label}</Text>
 *                 </View>
 *               </HorizontalSortableItem>
 *             );
 *           })}
 *         </Animated.ScrollView>
 *       </DropProvider>
 *     </GestureHandlerRootView>
 *   );
 * }
 * ```
 *
 * @example
 * Horizontal sortable list with reordering logic:
 * ```typescript
 * function ReorderableTagList() {
 *   const [tags, setTags] = useState(initialTags);
 *
 *   const handleReorder = useCallback((id: string, from: number, to: number) => {
 *     setTags(prevTags => {
 *       const newTags = [...prevTags];
 *       const [movedTag] = newTags.splice(from, 1);
 *       newTags.splice(to, 0, movedTag);
 *       return newTags;
 *     });
 *   }, []);
 *
 *   const sortableProps = useHorizontalSortableList({
 *     data: tags,
 *     itemWidth: 100,
 *     gap: 8,
 *     paddingHorizontal: 20,
 *   });
 *
 *   return (
 *     <HorizontalSortableContainer {...sortableProps}>
 *       {tags.map((tag, index) => {
 *         const itemProps = sortableProps.getItemProps(tag, index);
 *         return (
 *           <HorizontalSortableItem
 *             key={tag.id}
 *             {...itemProps}
 *             onMove={handleReorder}
 *           >
 *             <TagComponent tag={tag} />
 *           </HorizontalSortableItem>
 *         );
 *       })}
 *     </HorizontalSortableContainer>
 *   );
 * }
 */
export function useHorizontalSortableList<TData extends { id: string }>(
  options: UseHorizontalSortableListOptions<TData>
): UseHorizontalSortableListReturn<TData> {
  const {
    data,
    itemWidth,
    gap = 0,
    paddingHorizontal = 0,
    itemKeyExtractor = (item) => item.id,
  } = options;

  // Runtime validation in development mode
  if (__DEV__) {
    const seenIds = new Set<string>();
    data.forEach((item, index) => {
      const id = itemKeyExtractor(item, index);
      if (typeof id !== "string" || !id) {
        console.error(
          `[react-native-reanimated-dnd] Item at index ${index} has invalid id: ${id}. ` +
            `Each item must have a unique string id property.`
        );
      } else if (seenIds.has(id)) {
        console.error(
          `[react-native-reanimated-dnd] Duplicate item id "${id}" at index ${index}. ` +
            `Each sortable item must have a unique id.`
        );
      }
      seenIds.add(id);
    });
  }

  // Set up shared values
  const positions = useSharedValue(listToObject(data, itemKeyExtractor));
  const activeDragCount = useSharedValue(0);
  const pendingPositions = useSharedValue<{ [id: string]: number } | null>(
    null
  );
  const positionSync = useMemo<SortablePositionSync>(
    () => ({ activeDragCount, pendingPositions }),
    [activeDragCount, pendingPositions]
  );
  const scrollX = useSharedValue(0);
  const nativeScrollX = useSharedValue(0);
  const autoScroll = useSharedValue(HorizontalScrollDirection.None);
  const scrollViewRef = useAnimatedRef();
  const dropProviderRef = useRef<DropProviderRef | null>(null);

  const dataOrderKey = JSON.stringify(
    data.map((item, index) => itemKeyExtractor(item, index))
  );

  useEffect(() => {
    const nextPositions = listToObject(data, itemKeyExtractor);
    scheduleOnUI(() => {
      "worklet";
      const currentPositions = positions.value;
      const ids = Object.keys(nextPositions);
      const isUnchanged =
        ids.length === Object.keys(currentPositions).length &&
        ids.every((id) => currentPositions[id] === nextPositions[id]);

      if (isUnchanged) {
        return;
      }

      if (activeDragCount.value > 0) {
        pendingPositions.value = nextPositions;
      } else {
        positions.value = nextPositions;
      }
    });
  }, [dataOrderKey]);

  // Scrolling synchronization
  useAnimatedReaction(
    () => scrollX.value,
    (scrolling) => {
      if (scrolling !== nativeScrollX.value) {
        scrollTo(scrollViewRef, scrolling, 0, false);
      }
    }
  );

  // Handle scroll events
  const handleScroll = useAnimatedScrollHandler((event) => {
    nativeScrollX.value = event.contentOffset.x;
    scrollX.value = event.contentOffset.x;
  });

  const handleScrollEnd = useCallback(() => {
    let localScrollTimeout: NodeJS.Timeout | null = null;
    if (localScrollTimeout) {
      clearTimeout(localScrollTimeout);
    }
    localScrollTimeout = setTimeout(() => {
      dropProviderRef.current?.requestPositionUpdate();
    }, 50);
  }, []);

  // Calculate content width including gaps and padding
  const contentWidth = getContentWidth(
    data.length,
    itemWidth,
    gap,
    paddingHorizontal
  );

  // Helper to get props for each sortable item
  const getItemProps = useCallback(
    (item: TData, index: number) => {
      const id = itemKeyExtractor(item, index);
      return {
        id,
        positions,
        positionSync,
        leftBound: scrollX,
        autoScrollDirection: autoScroll,
        itemsCount: data.length,
        itemWidth,
        gap,
        paddingHorizontal,
      };
    },
    [
      data.length,
      itemWidth,
      gap,
      paddingHorizontal,
      itemKeyExtractor,
      positions,
      positionSync,
      scrollX,
      autoScroll,
    ]
  );

  return {
    positions,
    positionSync,
    scrollX,
    autoScroll,
    scrollViewRef,
    dropProviderRef,
    handleScroll,
    handleScrollEnd,
    contentWidth,
    getItemProps,
  };
}
