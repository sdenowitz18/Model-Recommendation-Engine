import { ModelCard } from "./ModelCard";
import { type Model, type Recommendation } from "@shared/schema";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useSaveComparison } from "@/hooks/use-advisor";
import { Loader2 } from "lucide-react";
import { motion } from "framer-motion";

interface RecommendationGridProps {
  sessionId: string;
  recommendations: (Recommendation & { model: Model })[];
}

export function RecommendationGrid({ sessionId, recommendations }: RecommendationGridProps) {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const saveComparison = useSaveComparison();

  const toggleSelection = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) 
        ? prev.filter(x => x !== id)
        : prev.length < 3 ? [...prev, id] : prev // Max 3
    );
  };

  const handleCompare = () => {
    saveComparison.mutate({ sessionId, modelIds: selectedIds });
  };

  if (recommendations.length === 0) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between sticky top-0 bg-background/80 backdrop-blur z-20 py-4 border-b">
        <div>
          <h2 className="text-2xl font-bold font-display text-foreground">Recommended Models</h2>
          <p className="text-muted-foreground text-sm">Based on your school's vision and context</p>
        </div>
        
        {selectedIds.length > 0 && (
          <div className="flex items-center gap-3 animate-in fade-in slide-in-from-right-4">
            <span className="text-sm font-medium text-muted-foreground">
              {selectedIds.length} selected
            </span>
            <Button 
              onClick={handleCompare} 
              disabled={selectedIds.length < 2 || saveComparison.isPending}
              className="shadow-lg shadow-primary/20"
            >
              {saveComparison.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Compare Selected
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pb-20">
        {recommendations.map((rec, index) => (
          <motion.div
            key={rec.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <ModelCard 
              model={rec.model} 
              score={rec.score} 
              rationale={rec.rationale || undefined}
              isSelected={selectedIds.includes(rec.model.id)}
              onSelectForComparison={() => toggleSelection(rec.model.id)}
            />
          </motion.div>
        ))}
      </div>
    </div>
  );
}
