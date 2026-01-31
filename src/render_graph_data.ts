// this is just the inferred type of PositionalGraphData<StyledGraphData<NestedGraphData>> for ease of reading

type Test = {
  tasks: {
    [key: string]: { // task id
      // original information from API
      data: {
        id: string;
        text: string;
        completed: boolean;
        inferred: boolean;
        due: number | null;
        createdAt: number | null;
        updatedAt: number | null;
        calculatedCompleted: boolean | null;
        calculatedDue: number | null;
        depsClear: boolean | null;
        parents: string[]; // ids to dependencies (edges) that point to its parents
        children: string[]; // ids to dependencies (edges) that point to its children
      };
      // below is information that we are adding and finally rendering
      text: string;
      color: [number, number, number
      ];
      borderColor: [number, number, number
      ];
      opacity: number;
      specialEffect: "glow" | "none";
      position: [number, number
      ];
    };
  };
  dependencies: {
    [key: string]: {
      data: {
        id: string;
        fromId: string; // id to the task that is the source of this dependency (edge) <-- we can use this information to infer how to draw the edges
        toId: string; // id to the task that is the target of this dependency (edge)
      };
      text: string;
      color: [number, number, number
      ];
      opacity: number;
      dotted: boolean;
    };
  };
}