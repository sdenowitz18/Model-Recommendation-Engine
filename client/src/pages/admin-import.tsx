import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileSpreadsheet, Loader2, ArrowLeft } from "lucide-react";

export default function AdminImport() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

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
        onClick={() => setLocation("/")}
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
    </div>
  );
}
