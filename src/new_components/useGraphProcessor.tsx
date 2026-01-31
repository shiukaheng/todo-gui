import { useRef } from "react";
import { TaskListOut } from "todo-client";
import { AbstractGraphProcessor } from "./AbstractGraphProcessor";


export function useGraphProcessor(taskList: TaskListOut) {
    const graphProcessorRef = useRef<AbstractGraphProcessor>(null);
    return graphProcessorRef;
}
