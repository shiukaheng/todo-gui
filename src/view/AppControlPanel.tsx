import React from 'react';

interface AppControlPanelProps {
    autoPanEnabled: boolean;
    onAutoPanChange: (enabled: boolean) => void;
}

export const AppControlPanel: React.FC<AppControlPanelProps> = ({
    autoPanEnabled,
    onAutoPanChange,
}) => {
    return (
        <div className="px-4 py-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                    type="checkbox"
                    checked={autoPanEnabled}
                    onChange={(e) => onAutoPanChange(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                />
                <span className="text-white text-sm">Auto-pan to selection</span>
            </label>
        </div>
    );
};
