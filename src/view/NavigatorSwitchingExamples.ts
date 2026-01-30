/**
 * Example: How to Switch Between Navigator Implementations
 * 
 * This file demonstrates the clean pattern for switching navigators.
 * Navigators are created without callbacks - the visualizer manages the connection.
 */

import { GraphVisualizer } from "./GraphVisualizer";
import { GraphNavigator } from "./GraphNavigator";
import { AutoFocusNavigator } from "./AutoFocusNavigator";
import { INavigator } from "./INavigator";

// Assume you have a visualizer instance
declare const visualizer: GraphVisualizer;
declare const svgSize: { width: number; height: number };

// ===== Example 1: Switch to Manual Navigation =====
function switchToManualNavigation() {
    // Create navigator without callbacks - visualizer will wire it up
    const manualNavigator = new GraphNavigator(
        100, // Initial scale
        svgSize
    );
    
    // Clean switch - all event handlers are automatically wired/unwired
    // and callbacks are set by the visualizer
    visualizer.setNavigator(manualNavigator);
}

// ===== Example 2: Switch to Auto-Focus Navigation =====
function switchToAutoFocus(nodePosition: [number, number]) {
    const currentTransform = visualizer.transform;
    
    // Create navigator without callbacks
    const autoFocusNavigator = new AutoFocusNavigator(
        currentTransform,
        svgSize
    );
    
    // Focus on a specific node
    autoFocusNavigator.focusOn(nodePosition[0], nodePosition[1], 150);
    
    // Clean switch - visualizer handles all the wiring
    visualizer.setNavigator(autoFocusNavigator);
}

// ===== Example 3: Disable Navigation =====
function disableNavigation() {
    // Simply set navigator to null
    visualizer.setNavigator(null);
}

// ===== Example 4: Conditional Navigator Based on Selection =====
function updateNavigatorBasedOnSelection(
    selectedNodeId: string | null,
    nodePosition: [number, number] | null,
    currentNavigator: INavigator | null
) {
    if (selectedNodeId && nodePosition) {
        // Node is selected - switch to auto-focus
        if (!(currentNavigator instanceof AutoFocusNavigator)) {
            const autoNav = new AutoFocusNavigator(
                visualizer.transform,
                svgSize
            );
            autoNav.focusOn(nodePosition[0], nodePosition[1]);
            visualizer.setNavigator(autoNav);
        } else {
            // Already in auto-focus, just update target
            (currentNavigator as AutoFocusNavigator).focusOn(nodePosition[0], nodePosition[1]);
        }
    } else {
        // No selection - switch to manual
        if (!(currentNavigator instanceof GraphNavigator)) {
            const manualNav = new GraphNavigator(
                100,
                svgSize
            );
            visualizer.setNavigator(manualNav);
        }
    }
}

// ===== Example 5: Toggle Between Navigators =====
let isAutoMode = false;
let manualNav: GraphNavigator | null = null;
let autoNav: AutoFocusNavigator | null = null;

function toggleNavigationMode(nodePosition?: [number, number]) {
    isAutoMode = !isAutoMode;
    
    if (isAutoMode) {
        // Save manual navigator state
        if (visualizer.getNavigator() instanceof GraphNavigator) {
            manualNav = visualizer.getNavigator() as GraphNavigator;
        }
        
        // Create auto navigator if needed
        if (!autoNav) {
            autoNav = new AutoFocusNavigator(
                visualizer.transform,
                svgSize
            );
        }
        
        if (nodePosition) {
            autoNav.focusOn(nodePosition[0], nodePosition[1]);
        }
        
        visualizer.setNavigator(autoNav);
    } else {
        // Restore manual navigator
        if (!manualNav) {
            manualNav = new GraphNavigator(
                100,
                svgSize
            );
        }
        
        visualizer.setNavigator(manualNav);
    }
}

export {
    switchToManualNavigation,
    switchToAutoFocus,
    disableNavigation,
    updateNavigatorBasedOnSelection,
    toggleNavigationMode
};
