import { type Model } from "@shared/schema";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ComparisonTableProps {
  models: Model[];
}

export function ComparisonTable({ models }: ComparisonTableProps) {
  if (models.length === 0) return null;

  const attributes = [
    { label: "Grades", key: "grades" },
    { label: "Key Practices", key: "keyPractices" },
    { label: "Outcome Types", key: "outcomeTypes" },
    { label: "Implementation Supports", key: "implementationSupports" },
  ] as const;

  return (
    <div className="border rounded-xl overflow-hidden shadow-sm bg-white">
      <ScrollArea className="w-full">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-[200px] font-bold">Attribute</TableHead>
              {models.map(m => (
                <TableHead key={m.id} className="min-w-[250px] font-bold text-primary font-display text-lg">
                  {m.name}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium text-muted-foreground">Description</TableCell>
              {models.map(m => (
                <TableCell key={m.id} className="align-top leading-relaxed text-sm">
                  {m.description}
                </TableCell>
              ))}
            </TableRow>
            
            {attributes.map((attr) => (
              <TableRow key={attr.key}>
                <TableCell className="font-medium text-muted-foreground">{attr.label}</TableCell>
                {models.map(m => (
                  <TableCell key={m.id} className="align-top">
                    <div className="flex flex-wrap gap-2">
                      {m[attr.key].split(',').map((item, i) => (
                        <Badge key={i} variant="outline" className="bg-white/50 font-normal">
                          {item.trim()}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
}
