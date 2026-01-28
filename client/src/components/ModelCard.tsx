import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, ArrowRight, ExternalLink, School } from "lucide-react";
import { type Model } from "@shared/schema";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

interface ModelCardProps {
  model: Model;
  score?: number;
  rationale?: string;
  onSelectForComparison?: () => void;
  isSelected?: boolean;
}

export function ModelCard({ model, score, rationale, onSelectForComparison, isSelected }: ModelCardProps) {
  // Parse grades and outcome types if they are strings
  const grades = model.grades.split(",").map(g => g.trim());
  const outcomes = model.outcomeTypes.split(",").map(o => o.trim()).slice(0, 3);

  return (
    <Card className={cn(
      "group relative overflow-hidden transition-all duration-300 hover:shadow-xl border-border/60 flex flex-col h-full",
      isSelected ? "ring-2 ring-primary border-primary bg-primary/5" : "hover:border-primary/50"
    )}>
      {/* Image Header */}
      <div className="h-40 overflow-hidden relative bg-muted">
        {model.imageUrl ? (
          <img 
            src={model.imageUrl} 
            alt={model.name}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted text-muted-foreground">
            <School className="w-12 h-12 opacity-50" />
          </div>
        )}
        {score && (
          <div className="absolute top-3 right-3 bg-white/95 backdrop-blur shadow-sm px-3 py-1 rounded-full text-xs font-bold text-primary flex items-center gap-1 border border-primary/10">
            <span className="text-base">{score}%</span> Match
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </div>

      <CardHeader className="p-5 pb-2">
        <div className="flex justify-between items-start gap-2">
          <h3 className="font-display font-bold text-xl leading-tight group-hover:text-primary transition-colors">
            {model.name}
          </h3>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {grades.map(g => (
            <Badge key={g} variant="secondary" className="text-[10px] px-2 h-5 font-medium">
              {g}
            </Badge>
          ))}
        </div>
      </CardHeader>

      <CardContent className="p-5 pt-2 flex-grow">
        <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed mb-4">
          {model.description}
        </p>
        
        {rationale && (
          <div className="bg-accent/50 p-3 rounded-lg text-xs text-accent-foreground border border-accent mb-4">
            <strong className="block mb-1 font-semibold">Why this fits:</strong>
            {rationale}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {outcomes.map(outcome => (
            <span key={outcome} className="inline-flex items-center text-[10px] text-muted-foreground border border-border px-2 py-1 rounded-md bg-background/50">
              <Check className="w-3 h-3 mr-1 text-green-500" />
              {outcome}
            </span>
          ))}
        </div>
      </CardContent>

      <CardFooter className="p-5 pt-0 mt-auto grid grid-cols-2 gap-3">
        {onSelectForComparison && (
          <Button 
            variant={isSelected ? "default" : "outline"} 
            size="sm" 
            className="w-full"
            onClick={onSelectForComparison}
          >
            {isSelected ? "Selected" : "Compare"}
          </Button>
        )}
        <Link href={`/models/${model.id}`} className="w-full">
          <Button variant="ghost" size="sm" className="w-full group/btn bg-secondary/50 hover:bg-secondary">
            Details 
            <ArrowRight className="w-3.5 h-3.5 ml-1 transition-transform group-hover/btn:translate-x-1" />
          </Button>
        </Link>
      </CardFooter>
    </Card>
  );
}
