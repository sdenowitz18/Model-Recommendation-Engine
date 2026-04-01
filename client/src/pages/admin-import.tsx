import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileSpreadsheet, Loader2, ArrowLeft, RefreshCw, Database, Save, Link2 } from "lucide-react";

export default function AdminImport() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [baseId, setBaseId] = useState("");
  const [tableId, setTableId] = useState("");
  const [apiToken, setApiToken] = useState("");

  const { data: airtableConfig } = useQuery<{ baseId: string | null; tableId: string | null; apiTokenConfigured: boolean }>({
    queryKey: ["/api/admin/airtable-config"],
    queryFn: async () => {
      const res = await fetch("/api/admin/airtable-config", { credentials: "include" });
      const text = await res.text();
      if (!res.ok) throw new Error("Failed to fetch config");
      try {
        return JSON.parse(text) as { baseId: string | null; tableId: string | null; apiTokenConfigured: boolean };
      } catch {
        if (text.trimStart().startsWith("<!") || text.trimStart().startsWith("<html")) {
          throw new Error("Server returned HTML instead of JSON. Is the API running? Try refreshing or check the dev server.");
        }
        throw new Error("Invalid response from server");
      }
    },
  });

  useEffect(() => {
    if (airtableConfig) {
      setBaseId(airtableConfig.baseId ?? "");
      setTableId(airtableConfig.tableId ?? "");
    }
  }, [airtableConfig]);

  const saveAirtableConfigMutation = useMutation({
    mutationFn: async () => {
      const payload: { baseId?: string; tableId?: string; apiToken?: string } = {
        baseId: baseId.trim() || undefined,
        tableId: tableId.trim() || undefined,
      };
      if (apiToken.trim()) payload.apiToken = apiToken.trim();
      const res = await fetch("/api/admin/airtable-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      const text = await res.text();
      if (!res.ok) throw new Error("Failed to save");
      try {
        return text ? JSON.parse(text) : { message: "Airtable config saved" };
      } catch {
        if (text.trimStart().startsWith("<!") || text.trimStart().startsWith("<html")) {
          throw new Error("Server returned HTML instead of JSON. Is the API running?");
        }
        throw new Error("Invalid response from server");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/airtable-config"] });
      toast({ title: "Airtable config saved" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    },
  });

  const handleAirtableSync = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch("/api/admin/refresh-from-airtable", {
        method: "POST",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Sync failed");
      }

      const result = await response.json();
      toast({
        title: "Sync Successful",
        description: result.message,
      });
    } catch (error: any) {
      toast({
        title: "Sync Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast({
        title: "No file selected",
        description: "Please select an Excel file to upload.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/admin/import-models", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Import failed");
      }

      const result = await response.json();
      toast({
        title: "Import Successful",
        description: result.message,
      });
      setFile(null);
    } catch (error: any) {
      toast({
        title: "Import Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <Button 
        variant="ghost" 
        className="mb-6" 
        onClick={() => setLocation("/workflow")}
        data-testid="button-back"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Advisor
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-6 w-6 text-primary" />
            Import School Design Models
          </CardTitle>
          <CardHeader>
          <CardDescription>
            Upload the `Transcend_Models_Comparison.xlsx` file. 
            The system expects a sheet named "Transcend Models" with the standard columns.
          </CardDescription>
          </CardHeader>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid w-full items-center gap-1.5">
            <Input
              id="excel-upload"
              type="file"
              accept=".xlsx, .xls"
              onChange={handleFileChange}
              disabled={isUploading}
              data-testid="input-file-upload"
            />
          </div>

          <Button 
            className="w-full" 
            onClick={handleUpload} 
            disabled={!file || isUploading}
            data-testid="button-submit-import"
          >
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Start Import
              </>
            )}
          </Button>

          {file && (
            <p className="text-sm text-muted-foreground text-center" data-testid="text-selected-file">
              Selected: {file.name}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-6 w-6 text-primary" />
            Airtable Connection
          </CardTitle>
          <CardDescription>
            Configure your Airtable connection. All values are stored in the app — no environment variables needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">API Token</label>
            <Input
              type="password"
              placeholder={airtableConfig?.apiTokenConfigured ? "•••••••• (configured — enter new token to update)" : "e.g. patXXXXXXXXXXXXXX"}
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              autoComplete="off"
              data-testid="input-airtable-api-token"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Base ID</label>
            <Input
              placeholder="e.g. appXXXXXXXXXXXXXX"
              value={baseId}
              onChange={(e) => setBaseId(e.target.value)}
              data-testid="input-airtable-base-id"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Table ID</label>
            <Input
              placeholder="e.g. tblXXXXXXXXXXXXXX"
              value={tableId}
              onChange={(e) => setTableId(e.target.value)}
              data-testid="input-airtable-table-id"
            />
          </div>
          <Button
            onClick={() => saveAirtableConfigMutation.mutate()}
            disabled={saveAirtableConfigMutation.isPending}
            data-testid="button-save-airtable-config"
          >
            {saveAirtableConfigMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Connection
          </Button>
          {baseId && tableId && (
            <a
              href={`https://airtable.com/${baseId}/${tableId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              <Link2 className="h-3.5 w-3.5" />
              Open Airtable table
            </a>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-6 w-6 text-primary" />
            Sync from Airtable
          </CardTitle>
          <CardDescription>
            Refresh the model database from your connected Airtable table.
            This will replace all existing models with the latest data from Airtable.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            className="w-full" 
            onClick={handleAirtableSync} 
            disabled={isSyncing}
            data-testid="button-refresh-airtable"
          >
            {isSyncing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh from Airtable
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
