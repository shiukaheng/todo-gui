import { useRef } from "react";
import { TaskListOut } from "todo-client";
import { nestGraphData } from "../new_utils/nestGraphData";
import { useGraphProcessor } from "./useGraphProcessor";

interface NewGraphViewerProps {
    taskList: TaskListOut;
}

export function NewGraphViewer({ taskList }: NewGraphViewerProps) {

    // Initialization
    const viewportContainerRef = useRef<HTMLDivElement>(null); // Reference to the viewport container (for graph rendering)
    
    const graphProcessorRef = useGraphProcessor(taskList); // Async graph processing chain

    return (
        <div className="absolute w-full h-full bg-black">
            <div className="absolute w-full h-full" ref={viewportContainerRef}/>
        </div>
    );
}