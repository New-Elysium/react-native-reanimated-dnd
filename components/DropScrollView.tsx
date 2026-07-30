import React, {
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native";
import { Dimensions, ScrollView } from "react-native";
import {
  DraggingPayload,
  SlotsContext,
  SlotsContextValue,
} from "../types/context";
import type { DropScrollViewProps } from "../types/dropScrollView";

interface ViewportMeasurement {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A ScrollView that coordinates scrolling with DropProvider.
 *
 * It refreshes registered draggable and droppable measurements after every
 * scroll frame and optionally auto-scrolls when the active draggable nears an
 * edge. Nested horizontal and vertical DropScrollViews can be used together.
 */
export const DropScrollView = forwardRef<any, DropScrollViewProps>(
  (
    {
      autoScroll = true,
      autoScrollThreshold = 56,
      autoScrollStep = 14,
      horizontal = false,
      onScroll,
      onLayout,
      onContentSizeChange,
      scrollEventThrottle = 16,
      ...props
    },
    forwardedRef
  ) => {
    const scrollViewRef = useRef<any>(null);
    const listenerId = useRef(
      `drop-scroll-view-${Math.random().toString(36).slice(2, 11)}`
    ).current;
    const viewportRef = useRef<ViewportMeasurement | null>(null);
    const contentSizeRef = useRef({ width: 0, height: 0 });
    const offsetRef = useRef({ x: 0, y: 0 });
    const positionUpdateFrameRef = useRef<number | null>(null);
    const autoScrollFrameRef = useRef<number | null>(null);
    const latestDraggingPayloadRef = useRef<DraggingPayload<any> | null>(null);

    const {
      requestPositionUpdate,
      registerDraggingListener,
      unregisterDraggingListener,
      isDragging,
    } = useContext(SlotsContext) as SlotsContextValue<any>;

    useImperativeHandle(forwardedRef, () => scrollViewRef.current);

    const measureViewport = useCallback(() => {
      scrollViewRef.current?.measureInWindow(
        (x: number, y: number, width: number, height: number) => {
          if (width > 0 && height > 0) {
            viewportRef.current = { x, y, width, height };
          }
        }
      );
    }, []);

    const schedulePositionUpdate = useCallback(() => {
      if (positionUpdateFrameRef.current !== null) {
        return;
      }

      positionUpdateFrameRef.current = requestAnimationFrame(() => {
        positionUpdateFrameRef.current = null;
        requestPositionUpdate();
        measureViewport();
      });
    }, [measureViewport, requestPositionUpdate]);

    const handleScroll = useCallback(
      (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        offsetRef.current = {
          x: event.nativeEvent.contentOffset.x,
          y: event.nativeEvent.contentOffset.y,
        };
        onScroll?.(event);
        schedulePositionUpdate();
      },
      [onScroll, schedulePositionUpdate]
    );

    const handleLayout = useCallback(
      (event: LayoutChangeEvent) => {
        onLayout?.(event);
        measureViewport();
        schedulePositionUpdate();
      },
      [measureViewport, onLayout, schedulePositionUpdate]
    );

    const handleContentSizeChange = useCallback(
      (width: number, height: number) => {
        contentSizeRef.current = { width, height };
        onContentSizeChange?.(width, height);
        schedulePositionUpdate();
      },
      [onContentSizeChange, schedulePositionUpdate]
    );

    const runAutoScrollFrame = useCallback(() => {
      autoScrollFrameRef.current = null;
      const payload = latestDraggingPayloadRef.current;

      if (!autoScroll || !payload || !viewportRef.current) {
        return;
      }

      const viewport = viewportRef.current;
      const windowWidth = Dimensions.get("window").width;
      const viewportX = viewport.width >= windowWidth - 1 ? 0 : viewport.x;
      const currentX = payload.x + payload.tx + payload.width / 2;
      const currentY = payload.y + payload.ty + payload.height / 2;
      const isInsideCrossAxis = horizontal
        ? currentY >= viewport.y && currentY <= viewport.y + viewport.height
        : currentX >= viewportX && currentX <= viewportX + viewport.width;

      if (!isInsideCrossAxis) {
        return;
      }

      let didScroll = false;

      if (horizontal) {
        const maxOffset = Math.max(
          0,
          contentSizeRef.current.width - viewport.width
        );
        let nextX = offsetRef.current.x;

        if (currentX <= viewportX + autoScrollThreshold) {
          nextX -= autoScrollStep;
        } else if (
          currentX >=
          viewportX + viewport.width - autoScrollThreshold
        ) {
          nextX += autoScrollStep;
        } else {
          return;
        }

        nextX = Math.max(0, Math.min(nextX, maxOffset));
        if (nextX !== offsetRef.current.x) {
          offsetRef.current.x = nextX;
          scrollViewRef.current?.scrollTo({
            x: nextX,
            y: offsetRef.current.y,
            animated: false,
          });
          didScroll = true;
        }
      } else {
        const maxOffset = Math.max(
          0,
          contentSizeRef.current.height - viewport.height
        );
        let nextY = offsetRef.current.y;

        if (currentY <= viewport.y + autoScrollThreshold) {
          nextY -= autoScrollStep;
        } else if (
          currentY >=
          viewport.y + viewport.height - autoScrollThreshold
        ) {
          nextY += autoScrollStep;
        } else {
          return;
        }

        nextY = Math.max(0, Math.min(nextY, maxOffset));
        if (nextY !== offsetRef.current.y) {
          offsetRef.current.y = nextY;
          scrollViewRef.current?.scrollTo({
            x: offsetRef.current.x,
            y: nextY,
            animated: false,
          });
          didScroll = true;
        }
      }

      if (didScroll) {
        schedulePositionUpdate();
        autoScrollFrameRef.current = requestAnimationFrame(runAutoScrollFrame);
      }
    }, [
      autoScroll,
      autoScrollStep,
      autoScrollThreshold,
      horizontal,
      schedulePositionUpdate,
    ]);

    const handleDragging = useCallback(
      (payload: DraggingPayload<any>) => {
        latestDraggingPayloadRef.current = payload;

        if (!autoScroll || !viewportRef.current) {
          return;
        }

        if (autoScrollFrameRef.current === null) {
          autoScrollFrameRef.current =
            requestAnimationFrame(runAutoScrollFrame);
        }
      },
      [autoScroll, runAutoScrollFrame]
    );

    useEffect(() => {
      if (!isDragging) {
        latestDraggingPayloadRef.current = null;
        if (autoScrollFrameRef.current !== null) {
          cancelAnimationFrame(autoScrollFrameRef.current);
          autoScrollFrameRef.current = null;
        }
      }
    }, [isDragging]);

    useEffect(() => {
      registerDraggingListener(listenerId, handleDragging);
      measureViewport();

      return () => {
        unregisterDraggingListener(listenerId);
        if (positionUpdateFrameRef.current !== null) {
          cancelAnimationFrame(positionUpdateFrameRef.current);
        }
        if (autoScrollFrameRef.current !== null) {
          cancelAnimationFrame(autoScrollFrameRef.current);
        }
      };
    }, [
      handleDragging,
      listenerId,
      measureViewport,
      registerDraggingListener,
      unregisterDraggingListener,
    ]);

    return (
      <ScrollView
        {...props}
        ref={scrollViewRef}
        horizontal={horizontal}
        onScroll={handleScroll}
        onLayout={handleLayout}
        onContentSizeChange={handleContentSizeChange}
        scrollEventThrottle={scrollEventThrottle}
      />
    );
  }
);

DropScrollView.displayName = "DropScrollView";
