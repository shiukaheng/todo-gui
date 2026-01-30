import { GraphData } from "@/types/GraphData";
import { PhysicsState } from "@/physics/PhysicsSimulator";

export type NavigationDirection = 'up' | 'down' | 'left' | 'right';

export interface KeyboardGraphNavigatorProps {
    graphData: GraphData;
    cursorNode: string | null;
    setCursorNode: (nodeId: string | null) => void;
    getPhysicsState: () => PhysicsState | null;
    disabled?: boolean;
}

export interface SelectionModalProps {
    options: SelectionOption[];
    onSelect: (nodeId: string) => void;
    onClose: () => void;
    title: string;
}

export interface SelectionOption {
    nodeId: string;
    label: string;
}
