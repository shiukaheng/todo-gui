import React from 'react';
import { GraphNode } from '@/types/GraphData';

interface NodeInfoOverlayProps {
    node: GraphNode | null;
    onClose: () => void;
}

export const NodeInfoOverlay: React.FC<NodeInfoOverlayProps> = ({ node, onClose }) => {
    if (!node) return null;

    const data = node.data;
    
    // Format date from unix timestamp
    const formatDate = (timestamp: any): string => {
        if (!timestamp) return 'Not set';
        // Handle Neo4j BigInt values - force conversion to regular number
        const tsNum = typeof timestamp === 'bigint' ? parseInt(timestamp.toString()) : Number(timestamp);
        const date = new Date(tsNum * 1000);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    };

    return (
        <div>
            {/* Content */}
            <div className="px-4 space-y-4">
                {/* ID */}
                <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide">ID</label>
                    <p className="text-white font-mono text-sm break-all">{data.id || node.id}</p>
                </div>

                {/* Text */}
                {data.text && (
                    <div>
                        <label className="text-xs text-gray-500 uppercase tracking-wide">Description</label>
                        <p className="text-white">{data.text}</p>
                    </div>
                )}

                {/* Status Row */}
                <div className="grid grid-cols-2 gap-3">
                    {/* Completed Status */}
                    <div>
                        <label className="text-xs text-gray-500 uppercase tracking-wide">Completed</label>
                        <div className="flex items-center gap-2 mt-1">
                            <div className={`w-3 h-3 rounded-full ${data.completed ? 'bg-green-500' : 'bg-gray-600'}`} />
                            <span className="text-white text-sm">{data.completed ? 'Yes' : 'No'}</span>
                        </div>
                    </div>

                    {/* Inferred Status */}
                    <div>
                        <label className="text-xs text-gray-500 uppercase tracking-wide">Inferred</label>
                        <div className="flex items-center gap-2 mt-1">
                            <div className={`w-3 h-3 rounded-full ${data.inferred ? 'bg-blue-500' : 'bg-gray-600'}`} />
                            <span className="text-white text-sm">{data.inferred ? 'Yes' : 'No'}</span>
                        </div>
                    </div>
                </div>

                {/* Calculated Completed */}
                {data.calculated_completed !== undefined && (
                    <div>
                        <label className="text-xs text-gray-500 uppercase tracking-wide">Calculated Completed</label>
                        <div className="flex items-center gap-2 mt-1">
                            <div className={`w-3 h-3 rounded-full ${data.calculated_completed ? 'bg-green-400' : 'bg-yellow-600'}`} />
                            <span className="text-white text-sm">{data.calculated_completed ? 'Complete' : 'Incomplete'}</span>
                        </div>
                    </div>
                )}

                {/* Due Date */}
                {data.due && (
                    <div>
                        <label className="text-xs text-gray-500 uppercase tracking-wide">Due Date</label>
                        <p className="text-white text-sm">{formatDate(data.due)}</p>
                    </div>
                )}

                {/* Calculated Due */}
                {data.calculated_due && (
                    <div>
                        <label className="text-xs text-gray-500 uppercase tracking-wide">Calculated Due</label>
                        <p className="text-yellow-400 text-sm">{formatDate(data.calculated_due)}</p>
                    </div>
                )}

                {/* Timestamps */}
                <div className="pt-3 space-y-2">
                    {data.created_at && (
                        <div>
                            <label className="text-xs text-gray-500 uppercase tracking-wide">Created</label>
                            <p className="text-gray-400 text-xs">{formatDate(data.created_at)}</p>
                        </div>
                    )}
                    {data.updated_at && (
                        <div>
                            <label className="text-xs text-gray-500 uppercase tracking-wide">Updated</label>
                            <p className="text-gray-400 text-xs">{formatDate(data.updated_at)}</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
