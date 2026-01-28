import { useSession, useSessionContext, useRecommendations, useComparison } from "@/hooks/use-advisor";
import { ChatInterface } from "@/components/ChatInterface";
import { RecommendationGrid } from "@/components/RecommendationGrid";
import { ComparisonTable } from "@/components/ComparisonTable";
import { ContextSummary } from "@/components/ContextSummary";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, LayoutGrid, SplitSquareHorizontal, FileText } from "lucide-react";
import { useState, useEffect } from "react";

export default function Home() {
  const { sessionId, isLoading: isSessionLoading } = useSession();
  const { data: context } = useSessionContext(sessionId);
  
  // Enable recommendations fetch only if context is ready
  const { data: recommendations = [], isLoading: isRecsLoading } = useRecommendations(
    sessionId, 
    !!context?.isReadyForRecommendation
  );
  
  const { data: comparison } = useComparison(sessionId);
  const [activeTab, setActiveTab] = useState("recommendations");

  // Auto-switch tabs when data becomes available
  useEffect(() => {
    if (comparison?.selection && comparison.models.length > 0) {
      setActiveTab("comparison");
    } else if (recommendations.length > 0) {
      setActiveTab("recommendations");
    }
  }, [comparison?.selection, recommendations.length]);

  if (isSessionLoading || !sessionId) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground font-medium">Initializing advisor...</span>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Left Pane: Chat - Sticky & Fixed Width */}
      <aside className="w-[400px] xl:w-[450px] shrink-0 h-full hidden md:block z-20">
        <ChatInterface sessionId={sessionId} />
      </aside>

      {/* Right Pane: Content - Scrollable */}
      <main className="flex-1 h-full overflow-hidden relative flex flex-col">
        {/* Mobile Header (Chat Toggle would go here if implementing mobile fully) */}
        
        <div className="p-6 border-b bg-white flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">School Design Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              {context?.isReadyForRecommendation 
                ? "Here are the best models based on your vision."
                : "Building your school profile..."}
            </p>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-[400px]">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="context">
                <FileText className="w-4 h-4 mr-2" /> Context
              </TabsTrigger>
              <TabsTrigger value="recommendations" disabled={recommendations.length === 0}>
                <LayoutGrid className="w-4 h-4 mr-2" /> Models
              </TabsTrigger>
              <TabsTrigger value="comparison" disabled={!comparison?.models || comparison.models.length === 0}>
                <SplitSquareHorizontal className="w-4 h-4 mr-2" /> Compare
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <ScrollArea className="flex-1 bg-secondary/20 p-6">
          <div className="max-w-6xl mx-auto space-y-8 pb-20">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              
              <TabsContent value="context" className="mt-0 focus-visible:outline-none">
                {context && <ContextSummary context={context} />}
              </TabsContent>

              <TabsContent value="recommendations" className="mt-0 focus-visible:outline-none">
                {isRecsLoading ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
                    <p className="text-muted-foreground">Analyzing models against your context...</p>
                  </div>
                ) : recommendations.length > 0 ? (
                  <RecommendationGrid sessionId={sessionId} recommendations={recommendations} />
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-center max-w-md mx-auto">
                    <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-6">
                      <LayoutGrid className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-bold text-foreground mb-2">No recommendations yet</h3>
                    <p className="text-muted-foreground">
                      Use the chat on the left to tell me about your school's vision, grade levels, and desired outcomes.
                    </p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="comparison" className="mt-0 focus-visible:outline-none">
                {comparison?.models && comparison.models.length > 0 ? (
                  <div className="space-y-4">
                     <div className="flex items-center justify-between">
                      <h2 className="text-xl font-bold font-display">Model Comparison</h2>
                      <span className="text-sm text-muted-foreground">{comparison.models.length} models selected</span>
                     </div>
                     <ComparisonTable models={comparison.models} />
                  </div>
                ) : (
                  <div className="text-center py-20 text-muted-foreground">
                    Select models from the recommendations tab to compare them.
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </ScrollArea>
      </main>
    </div>
  );
}
