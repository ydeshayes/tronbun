/**
 * Workflow Store - Persistence for workflows and websites
 */

import { join } from "path";
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, unlinkSync } from "fs";
import type { Website, Workflow } from "./types";
import { generateId } from "./types";

export class WorkflowStore {
    private dataDir: string;
    private workflowsDir: string;
    private websitesFile: string;

    constructor(dataDir: string) {
        this.dataDir = dataDir;
        this.workflowsDir = join(dataDir, "workflows");
        this.websitesFile = join(dataDir, "websites.json");

        // Ensure directories exist
        if (!existsSync(this.dataDir)) {
            mkdirSync(this.dataDir, { recursive: true });
        }
        if (!existsSync(this.workflowsDir)) {
            mkdirSync(this.workflowsDir, { recursive: true });
        }
    }

    // =========================================================================
    // Website Management
    // =========================================================================

    /**
     * Load all websites
     */
    loadWebsites(): Website[] {
        try {
            if (existsSync(this.websitesFile)) {
                const data = readFileSync(this.websitesFile, "utf-8");
                return JSON.parse(data);
            }
        } catch (error) {
            console.error("[WorkflowStore] Failed to load websites:", error);
        }
        return [];
    }

    /**
     * Save websites list
     */
    saveWebsites(websites: Website[]): void {
        try {
            writeFileSync(this.websitesFile, JSON.stringify(websites, null, 2));
        } catch (error) {
            console.error("[WorkflowStore] Failed to save websites:", error);
            throw error;
        }
    }

    /**
     * Add a new website
     */
    addWebsite(website: Omit<Website, "id">): Website {
        const websites = this.loadWebsites();
        const newWebsite: Website = {
            id: generateId(),
            ...website
        };
        websites.push(newWebsite);
        this.saveWebsites(websites);
        return newWebsite;
    }

    /**
     * Update a website
     */
    updateWebsite(id: string, updates: Partial<Website>): Website | null {
        const websites = this.loadWebsites();
        const index = websites.findIndex(w => w.id === id);
        if (index === -1) return null;

        websites[index] = { ...websites[index], ...updates };
        this.saveWebsites(websites);
        return websites[index];
    }

    /**
     * Delete a website
     */
    deleteWebsite(id: string): boolean {
        const websites = this.loadWebsites();
        const filtered = websites.filter(w => w.id !== id);
        if (filtered.length === websites.length) return false;

        this.saveWebsites(filtered);
        return true;
    }

    /**
     * Get a website by ID
     */
    getWebsite(id: string): Website | null {
        const websites = this.loadWebsites();
        return websites.find(w => w.id === id) || null;
    }

    // =========================================================================
    // Workflow Management
    // =========================================================================

    /**
     * Load all workflows
     */
    loadWorkflows(): Workflow[] {
        const workflows: Workflow[] = [];

        try {
            if (!existsSync(this.workflowsDir)) {
                return workflows;
            }

            const files = readdirSync(this.workflowsDir);
            for (const file of files) {
                if (!file.endsWith(".json")) continue;

                try {
                    const data = readFileSync(join(this.workflowsDir, file), "utf-8");
                    const workflow = JSON.parse(data) as Workflow;
                    workflows.push(workflow);
                } catch (error) {
                    console.error(`[WorkflowStore] Failed to load workflow ${file}:`, error);
                }
            }
        } catch (error) {
            console.error("[WorkflowStore] Failed to load workflows:", error);
        }

        // Sort by updated date, newest first
        workflows.sort((a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );

        return workflows;
    }

    /**
     * Save a workflow
     */
    saveWorkflow(workflow: Workflow): void {
        workflow.updatedAt = new Date().toISOString();

        const filepath = join(this.workflowsDir, `${workflow.id}.json`);

        try {
            // Remove screenshots from steps to reduce file size
            const workflowToSave = {
                ...workflow,
                steps: workflow.steps.map(step => ({
                    ...step,
                    screenshot: undefined // Don't persist screenshots
                }))
            };

            writeFileSync(filepath, JSON.stringify(workflowToSave, null, 2));
            console.log(`[WorkflowStore] Saved workflow: ${workflow.name}`);
        } catch (error) {
            console.error("[WorkflowStore] Failed to save workflow:", error);
            throw error;
        }
    }

    /**
     * Load a specific workflow
     */
    loadWorkflow(id: string): Workflow | null {
        const filepath = join(this.workflowsDir, `${id}.json`);

        try {
            if (!existsSync(filepath)) {
                return null;
            }

            const data = readFileSync(filepath, "utf-8");
            return JSON.parse(data) as Workflow;
        } catch (error) {
            console.error(`[WorkflowStore] Failed to load workflow ${id}:`, error);
            return null;
        }
    }

    /**
     * Delete a workflow
     */
    deleteWorkflow(id: string): boolean {
        const filepath = join(this.workflowsDir, `${id}.json`);

        try {
            if (!existsSync(filepath)) {
                return false;
            }

            unlinkSync(filepath);
            console.log(`[WorkflowStore] Deleted workflow: ${id}`);
            return true;
        } catch (error) {
            console.error(`[WorkflowStore] Failed to delete workflow ${id}:`, error);
            return false;
        }
    }

    /**
     * Get workflows for a specific website
     */
    getWorkflowsForWebsite(websiteId: string): Workflow[] {
        return this.loadWorkflows().filter(w => w.websiteId === websiteId);
    }

    /**
     * Export a workflow to a file
     */
    exportWorkflow(workflow: Workflow, filepath: string): void {
        const exportData = {
            ...workflow,
            exportedAt: new Date().toISOString(),
            version: "1.0"
        };

        writeFileSync(filepath, JSON.stringify(exportData, null, 2));
    }

    /**
     * Import a workflow from a file
     */
    importWorkflow(filepath: string): Workflow | null {
        try {
            const data = readFileSync(filepath, "utf-8");
            const imported = JSON.parse(data) as Workflow & { exportedAt?: string; version?: string };

            // Generate new ID to avoid conflicts
            const workflow: Workflow = {
                ...imported,
                id: generateId(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            // Remove export metadata
            delete (workflow as any).exportedAt;
            delete (workflow as any).version;

            // Save the imported workflow
            this.saveWorkflow(workflow);

            return workflow;
        } catch (error) {
            console.error(`[WorkflowStore] Failed to import workflow from ${filepath}:`, error);
            return null;
        }
    }
}
