import React, { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  SortableBoard,
  SortableBoardColumn,
  SortableBoardMoveEvent,
} from "react-native-reanimated-dnd";
import { ExampleHeader } from "@/components/ExampleHeader";
import { colors } from "@/theme";

interface KanbanCard {
  id: string;
  title: string;
  label: string;
}

interface KanbanColumn extends SortableBoardColumn<KanbanCard> {
  title: string;
  accent: string;
}

const INITIAL_COLUMNS: KanbanColumn[] = [
  {
    id: "todo",
    title: "To do",
    accent: "#58A6FF",
    items: [
      { id: "research", title: "Research gestures", label: "DESIGN" },
      { id: "api", title: "Define board API", label: "CORE" },
      { id: "docs", title: "Write migration guide", label: "DOCS" },
      { id: "tests", title: "Add simulator tests", label: "QA" },
      { id: "release", title: "Prepare v2.1 notes", label: "RELEASE" },
      { id: "polish", title: "Polish card motion", label: "MOTION" },
      { id: "analytics", title: "Review interaction metrics", label: "DATA" },
      { id: "a11y", title: "Audit accessibility", label: "A11Y" },
    ],
  },
  {
    id: "doing",
    title: "In progress",
    accent: "#D29922",
    items: [
      { id: "overlay", title: "Root drag overlay", label: "CORE" },
      { id: "scroll", title: "Nested auto-scroll", label: "MOTION" },
    ],
  },
  {
    id: "done",
    title: "Done",
    accent: "#3FB950",
    items: [{ id: "reanimated", title: "Reanimated 4 support", label: "CORE" }],
  },
];

interface KanbanBoardExampleProps {
  onBack: () => void;
}

export function KanbanBoardExample({ onBack }: KanbanBoardExampleProps) {
  const [columns, setColumns] = useState<KanbanColumn[]>(INITIAL_COLUMNS);
  const [lastMove, setLastMove] =
    useState<SortableBoardMoveEvent<KanbanCard> | null>(null);

  const handleChange = useCallback(
    (
      nextColumns: KanbanColumn[],
      event: SortableBoardMoveEvent<KanbanCard>
    ) => {
      setColumns(nextColumns);
      setLastMove(event);
    },
    []
  );

  return (
    <View style={styles.container}>
      <ExampleHeader title="Kanban Board" onBack={onBack} />
      <View style={styles.descriptionContainer}>
        <Text style={styles.description}>
          Reorder cards or drag them between columns. Hold near an edge to
          auto-scroll.
        </Text>
        <Text testID="kanban-last-move" style={styles.lastMove}>
          {lastMove
            ? `${lastMove.item.title}: ${lastMove.fromColumnId} to ${lastMove.toColumnId}`
            : "No moves yet"}
        </Text>
      </View>

      <SortableBoard<KanbanCard, KanbanColumn>
        columns={columns}
        onChange={handleChange}
        activationDelay={120}
        columnWidth={268}
        columnGap={12}
        itemGap={10}
        contentContainerStyle={styles.boardContent}
        columnStyle={styles.column}
        columnContentStyle={styles.columnContent}
        itemContainerStyle={styles.itemContainer}
        activeDropStyle={styles.activeDrop}
        overlayStyle={styles.overlay}
        renderColumnHeader={(column) => (
          <View style={styles.columnHeader}>
            <View style={[styles.accent, { backgroundColor: column.accent }]} />
            <Text style={styles.columnTitle}>{column.title}</Text>
            <Text style={styles.count}>{column.items.length}</Text>
          </View>
        )}
        renderEmptyColumn={() => (
          <View style={styles.emptyColumn}>
            <Text style={styles.emptyText}>Drop a card here</Text>
          </View>
        )}
        renderItem={({ item, columnId, isDragging, isOverlay }) => (
          <View
            testID={
              isOverlay ? undefined : `kanban-card-${columnId}-${item.id}`
            }
            style={[styles.card, isDragging && styles.draggingCard]}
          >
            <Text style={styles.cardLabel}>{item.label}</Text>
            <Text style={styles.cardTitle}>{item.title}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  descriptionContainer: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 12,
  },
  description: {
    color: "#64748B",
    fontFamily: "Outfit_400Regular",
    fontSize: 13,
    lineHeight: 18,
  },
  lastMove: {
    color: "#94A3B8",
    fontFamily: "Outfit_500Medium",
    fontSize: 11,
    marginTop: 6,
  },
  boardContent: {
    paddingHorizontal: 18,
    paddingBottom: 18,
  },
  column: {
    borderRadius: 16,
    backgroundColor: "#0F111A",
    borderWidth: 1,
    borderColor: "#1A1C26",
    padding: 12,
  },
  columnHeader: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 38,
    marginBottom: 8,
  },
  accent: {
    width: 3,
    height: 18,
    borderRadius: 2,
    marginRight: 9,
  },
  columnTitle: {
    flex: 1,
    color: "#F1F5F9",
    fontFamily: "Outfit_600SemiBold",
    fontSize: 15,
  },
  count: {
    minWidth: 24,
    color: "#64748B",
    fontFamily: "Outfit_600SemiBold",
    fontSize: 12,
    textAlign: "center",
  },
  columnContent: {
    paddingBottom: 8,
  },
  itemContainer: {
    width: "75%",
    alignSelf: "center",
  },
  card: {
    minHeight: 76,
    borderRadius: 12,
    backgroundColor: "#171A25",
    borderWidth: 1,
    borderColor: "#262B3A",
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: "center",
  },
  draggingCard: {
    borderColor: "#58A6FF",
    shadowColor: "#000000",
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  cardLabel: {
    color: "#58A6FF",
    fontFamily: "Outfit_600SemiBold",
    fontSize: 9,
    letterSpacing: 1.2,
    marginBottom: 7,
  },
  cardTitle: {
    color: "#E2E8F0",
    fontFamily: "Outfit_500Medium",
    fontSize: 14,
  },
  emptyColumn: {
    minHeight: 86,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: "#475569",
    fontFamily: "Outfit_400Regular",
    fontSize: 12,
  },
  activeDrop: {
    backgroundColor: "rgba(88, 166, 255, 0.08)",
    borderColor: "rgba(88, 166, 255, 0.55)",
    borderRadius: 12,
  },
  overlay: {
    width: 183,
  },
});
