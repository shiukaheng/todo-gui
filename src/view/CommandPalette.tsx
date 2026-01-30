import React, { useEffect, useRef, useState } from "react";

interface CommandPaletteProps {
    onCommandRun: (command: string) => string | void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ onCommandRun }) => {
    const [isVisible, setIsVisible] = useState(false);
    const [commandOutput, setCommandOutput] = useState<{type: "error" | "success", message: string | null}>({type: "success", message: null});
    const inputRef = useRef<HTMLInputElement>(null);
    const commandHistoryRef = useRef<string[]>([]);
    const commandIndexRef = useRef<number | null>(null);

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Enter") {
            if (!isVisible) {
                inputRef.current!.value = "";
                commandIndexRef.current = null;
                setIsVisible(true);
                setTimeout(() => {
                    inputRef.current?.focus()
                }, 0);
            } else {
                const command = inputRef.current?.value;
                if (command) {
                    let output: string | undefined = undefined;
                    try {
                        console.log("Running command:", command);
                        output = onCommandRun(command) ?? undefined;
                        console.log("Command output:", output);
                        setCommandOutput({type: "success", message: output ?? null});
                    } catch (e) {
                        console.error(e);
                        setCommandOutput({type: "error", message: (e as Error).message});
                    }
                    commandHistoryRef.current.push(command);
                }
                inputRef.current!.value = "";
            }
        } else if (e.key === "Escape") {
            if (isVisible) {
                e.stopPropagation(); // Prevent propagation when palette is visible
            }
            setCommandOutput({type: "success", message: null});
            setIsVisible(false);
        } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            handleHistoryNavigation(e.key);
        }
    };

    const handleHistoryNavigation = (direction: string) => {
        if (commandHistoryRef.current.length === 0) return;

        if (direction === "ArrowUp") {
            if (commandIndexRef.current === null) {
                commandIndexRef.current = commandHistoryRef.current.length - 1;
            } else {
                commandIndexRef.current = Math.max(0, commandIndexRef.current - 1);
            }
        } else if (direction === "ArrowDown") {
            if (commandIndexRef.current !== null) {
                commandIndexRef.current = Math.min(commandHistoryRef.current.length - 1, commandIndexRef.current + 1);
            }
        }
        
        inputRef.current!.value = commandHistoryRef.current[commandIndexRef.current!];
        setTimeout(() => {
            inputRef.current!.setSelectionRange(inputRef.current!.value.length, inputRef.current!.value.length);
        }, 0);
    };

    useEffect(() => {
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [isVisible]);

    return (
        <div className={`${isVisible ? "block" : "hidden"} absolute top-0 left-0 w-full h-full text-white pointer-events-none`}>
            <div className="
                absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-1.5xl rounded-[2rem] backdrop-blur-2xl overflow-clip bg-zinc-500 bg-opacity-25 flex flex-col p-8 px-10 gap-4 pointer-events-auto w-[40rem]
            ">
                <input
                    ref={inputRef}
                    type="text"
                    className="text-3xl w-96 outline-none border-none bg-transparent w-full"
                    placeholder="Type 'help' for commands..."
                />
                {
                    commandOutput.message && (
                        <div className={`${commandOutput.type === "error" ? "text-red-500" : "text-gray-300"} whitespace-pre-wrap`}>
                            {commandOutput.message}
                        </div>
                    )
                }
            </div>
        </div>
    );
};
