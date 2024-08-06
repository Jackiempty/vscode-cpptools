/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All Rights Reserved.
 * See 'LICENSE' in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as path from 'path';
import * as vscode from 'vscode';
import { Position, Range, RequestType, TextDocumentIdentifier } from 'vscode-languageclient';
import * as Telemetry from '../../telemetry';
import { DefaultClient, workspaceReferences } from '../client';
import { CancellationSender } from '../references';
import { makeVscodeRange } from '../utils';

// log file
var fs = require("fs");
var logger = fs.createWriteStream("~/Desktop/dump_file/hierarchy.txt", {
    flags: "a"
});

var call_in = fs.createWriteStream("~/Desktop/dump_file/call_in.txt", {
    flags: "a"
});

// var call_out = fs.createWriteStream("~/Desktop/dump_file/call_out.txt", {
//     flags: "a"
// });

interface CallHierarchyItem {
    /**
     * The name of this item or symbol.
     */
    name: string;

    /**
     * The kind of this item.
     */
    kind: vscode.SymbolKind;

    /**
     * More detail for this item, e.g. the scope or class of a function.
     */
    detail: string;

    /**
     * The file path of this item.
     */
    file: string;

    /**
     * The range enclosing this symbol not including leading/trailing whitespace but everything else, e.g. comments and code.
     */
    range: Range;

    /**
     * The range that should be selected and revealed when this symbol is being picked, e.g. the name of a function.
     * Must be contained by the `CallHierarchyItem.range`.
     */
    selectionRange: Range;
}

export interface CallHierarchyParams {
    textDocument: TextDocumentIdentifier;
    position: Position;
}

interface CallHierarchyItemResult {
    item?: CallHierarchyItem;

    /**
     * If a request is cancelled, `succeeded` will be undefined to indicate no result was returned.
     * Therefore, object is not defined as optional on the language server.
     */
    succeeded: boolean;
}

interface CallHierarchyCallsItem {
    /**
     * For CallHierarchyIncomingCall or calls to, this is the item that makes the call.
     * For CallHierarchyOutgoingCall or calls from, this is the item that is called.
     */
    item: CallHierarchyItem;

    /**
     * For CallHierarchyIncomingCall or calls to, this is the range at which the call appears.
     * For CallHierarchyOutgoingCall or calls from, this is the range at which this item is called.
     */
    fromRanges: Range[];
}

export interface CallHierarchyCallsItemResult {
    calls: CallHierarchyCallsItem[];
}

enum CallHierarchyRequestStatus {
    Unknown,
    Succeeded,
    Canceled,
    CanceledByUser,
    Failed
}

const CallHierarchyItemRequest: RequestType<CallHierarchyParams, CallHierarchyItemResult, void> =
    new RequestType<CallHierarchyParams, CallHierarchyItemResult, void>('cpptools/prepareCallHierarchy');

const CallHierarchyCallsToRequest: RequestType<CallHierarchyParams, CallHierarchyCallsItemResult, void> =
    new RequestType<CallHierarchyParams, CallHierarchyCallsItemResult, void>('cpptools/callHierarchyCallsTo');

const CallHierarchyCallsFromRequest: RequestType<CallHierarchyParams, CallHierarchyCallsItemResult, void> =
    new RequestType<CallHierarchyParams, CallHierarchyCallsItemResult, void>('cpptools/callHierarchyCallsFrom');

export class CallHierarchyProvider implements vscode.CallHierarchyProvider {
    // Indicates whether a request is from an entry root node (e.g. top function in the call tree).
    private isEntryRootNodeTelemetry: boolean = false;
    private client: DefaultClient;

    constructor(client: DefaultClient) {
        this.client = client;
    }

    private counter: number = 0;


    public async prepareCallHierarchy(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.CallHierarchyItem | undefined> {
        await this.client.ready;
        console.log("Writing hierarchy....");
        workspaceReferences.cancelCurrentReferenceRequest(CancellationSender.NewRequest);
        workspaceReferences.clearViews();

        const range: vscode.Range | undefined = document.getWordRangeAtPosition(position);
        if (range === undefined) {
            console.log("Aborted_1");
            return undefined;
        }

        // Listen to a cancellation for this request. When this request is cancelled,
        // use a local cancellation source to explicitly cancel a token.
        const cancelSource: vscode.CancellationTokenSource = new vscode.CancellationTokenSource();
        const cancellationTokenListener: vscode.Disposable = token.onCancellationRequested(() => {
            console.log("Aborted_2");
            cancelSource.cancel();
        });
        const requestCanceledListener: vscode.Disposable = workspaceReferences.onCancellationRequested(_sender => {
            console.log("Aborted_3");
            cancelSource.cancel();
        });
        // ------------------------------------- Work starts from here ----------------------------------------
        const params: CallHierarchyParams = {
            textDocument: { uri: document.uri.toString() },
            position: Position.create(position.line, position.character)
        };
        const response: CallHierarchyItemResult = await this.client.languageClient.sendRequest(CallHierarchyItemRequest, params, cancelSource.token);
        
        cancellationTokenListener.dispose();
        requestCanceledListener.dispose();
        
        if (cancelSource.token.isCancellationRequested || response.succeeded === undefined) {
            // Return undefined instead of vscode.CancellationError to avoid the following error message from VS Code:
            // "MISSING provider."
            // TODO: per issue https://github.com/microsoft/vscode/issues/169698 vscode.CancellationError is expected,
            // so when VS Code fixes the error use vscode.CancellationError again.
            console.log("Aborted_4");
            return undefined;
        } else if (response.item === undefined) {
            console.log("Aborted_5");
            return undefined;
        }
        
        console.log("Responsed....");
        return this.makeVscodeCallHierarchyItem(response.item);
    }

    public async provideCallHierarchyIncomingCalls(item: vscode.CallHierarchyItem, token: vscode.CancellationToken):
    Promise<vscode.CallHierarchyIncomingCall[] | undefined> {
        await this.client.ready;
        workspaceReferences.cancelCurrentReferenceRequest(CancellationSender.NewRequest);
        
        const CallHierarchyCallsToEvent: string = "CallHierarchyCallsTo";
        if (item === undefined) {
            this.logTelemetry(CallHierarchyCallsToEvent, CallHierarchyRequestStatus.Failed);
            return undefined;
        }
        
        // Listen to a cancellation for this request. When this request is cancelled,
        // use a local cancellation source to explicitly cancel a token.
        let requestCanceled: CancellationSender | undefined;
        const cancelSource: vscode.CancellationTokenSource = new vscode.CancellationTokenSource();
        const cancellationTokenListener: vscode.Disposable = token.onCancellationRequested(() => {
            requestCanceled = CancellationSender.ProviderToken;
            cancelSource.cancel();
        });
        const requestCanceledListener: vscode.Disposable = workspaceReferences.onCancellationRequested(sender => {
            requestCanceled = sender;
            cancelSource.cancel();
        });
        
        // Send the request to the language server.
        let result: vscode.CallHierarchyIncomingCall[] | undefined;
        const params: CallHierarchyParams = {
            textDocument: { uri: item.uri.toString() },
            position: Position.create(item.selectionRange.start.line, item.selectionRange.start.character)
        };
        
        const response: CallHierarchyCallsItemResult = await this.client.languageClient.sendRequest(CallHierarchyCallsToRequest, params, cancelSource.token);
        

        // Reset anything that can be cleared before processing the result.
        const progressBarDuration: number | undefined = workspaceReferences.getCallHierarchyProgressBarDuration();
        workspaceReferences.resetProgressBar();
        workspaceReferences.resetReferences();
        cancellationTokenListener.dispose();
        requestCanceledListener.dispose();
        console.log("Test_1");
        // Process the result.
        if (cancelSource.token.isCancellationRequested || response.calls === undefined || requestCanceled !== undefined) {
            const requestStatus: CallHierarchyRequestStatus = requestCanceled === CancellationSender.User ?
                CallHierarchyRequestStatus.CanceledByUser : CallHierarchyRequestStatus.Canceled;
            this.logTelemetry(CallHierarchyCallsToEvent, requestStatus, progressBarDuration);
            console.log("Test_2");
            console.log(item.name);
            console.log(cancelSource.token.isCancellationRequested);
            console.log(response.calls === undefined);
            console.log(requestCanceled !== undefined);
            throw new vscode.CancellationError();
        } else if (response.calls.length !== 0) {
            console.log("Test_3");
            result = this.createIncomingCalls(response.calls, token); // here !!!!, reponses.call is a array, maybe can do recurrsive move
            console.log("Test_4");
        }
        console.log("Test_5");
        this.logTelemetry(CallHierarchyCallsToEvent, CallHierarchyRequestStatus.Succeeded, progressBarDuration);
        console.log("dump_income....");
        return result;
    }

    public async provideCallHierarchyOutgoingCalls(item: vscode.CallHierarchyItem, token: vscode.CancellationToken):
    Promise<vscode.CallHierarchyOutgoingCall[] | undefined> {
        const CallHierarchyCallsFromEvent: string = "CallHierarchyCallsFrom";
        if (item === undefined) {
            this.logTelemetry(CallHierarchyCallsFromEvent, CallHierarchyRequestStatus.Failed);
            return undefined;
        }

        await this.client.ready;

        let result: vscode.CallHierarchyOutgoingCall[] | undefined;
        const params: CallHierarchyParams = {
            textDocument: { uri: item.uri.toString() },
            position: Position.create(item.selectionRange.start.line, item.selectionRange.start.character)
        };
        const response: CallHierarchyCallsItemResult = await this.client.languageClient.sendRequest(CallHierarchyCallsFromRequest, params, token);

        if (token.isCancellationRequested || response.calls === undefined) {
            this.logTelemetry(CallHierarchyCallsFromEvent, CallHierarchyRequestStatus.Canceled);
            throw new vscode.CancellationError();
        } else if (response.calls.length !== 0) {
            result = this.createOutgoingCalls(response.calls);
        }

        this.logTelemetry(CallHierarchyCallsFromEvent, CallHierarchyRequestStatus.Succeeded);
        console.log("dump_outgo....");
        return result;
    }

    private makeVscodeCallHierarchyItem(item: CallHierarchyItem): vscode.CallHierarchyItem {
        const containerDetail: string = (item.detail !== "") ? `${item.detail} - ` : "";
        const itemUri: vscode.Uri = vscode.Uri.file(item.file);

        this.counter++;
        console.log(this.counter);
        
        // Get file detail
        const isInWorkspace: boolean = this.client.RootUri !== undefined &&
            itemUri.fsPath.startsWith(this.client.RootUri?.fsPath);
        const dirPath: string = isInWorkspace ?
            path.relative(this.client.RootPath, path.dirname(item.file)) : path.dirname(item.file);
        const fileDetail: string = dirPath.length === 0 ?
            `${path.basename(item.file)}` : `${path.basename(item.file)} (${dirPath})`;
        
        console.log("dump....");
        this.dump(containerDetail + fileDetail);
        this.dump(itemUri.fsPath);
        this.dump(item.name);
        this.dump(String(item.range.start.line + 1));
        this.dump(" ");
        
        return new vscode.CallHierarchyItem(
            item.kind,
            item.name,
            containerDetail + fileDetail,
            itemUri,
            makeVscodeRange(item.range),
            makeVscodeRange(item.selectionRange));
    }

    private createIncomingCalls(calls: CallHierarchyCallsItem[], token: vscode.CancellationToken): vscode.CallHierarchyIncomingCall[] {
        const result: vscode.CallHierarchyIncomingCall[] = [];
        
        for (const call of calls) {
            const item: vscode.CallHierarchyItem = this.makeVscodeCallHierarchyItem(call.item);
            const ranges: vscode.Range[] = [];
            // const range: vscode.Range = makeVscodeRange(call.fromRanges[0]);
            call.fromRanges.forEach(r => {
                // console.log("hello");
                ranges.push(makeVscodeRange(r));
            });

            const incomingCall: vscode.CallHierarchyIncomingCall =
                new vscode.CallHierarchyIncomingCall(item, ranges);
            result.push(incomingCall);
            // console.log(String(range.start.line + 1));
            // const token: vscode.CancellationToken = 
            this.provideCallHierarchyIncomingCalls(item, token);
        }
        
        for (var val of result) {
            this.call_in(val.from.uri.fsPath)
            this.call_in(val.from.name);
            for (var val2 of val.fromRanges) {
                this.call_in(String(val2.start.line + 1));
            }
            // this.call_in(String(val.from.range.start.line + 1));
            this.call_in("");
        }
        return result;
    }

    private createOutgoingCalls(calls: CallHierarchyCallsItem[]): vscode.CallHierarchyOutgoingCall[] {
        const result: vscode.CallHierarchyOutgoingCall[] = [];

        for (const call of calls) {
            const item: vscode.CallHierarchyItem = this.makeVscodeCallHierarchyItem(call.item);
            const ranges: vscode.Range[] = [];
            call.fromRanges.forEach(r => {
                ranges.push(makeVscodeRange(r));
            });

            const outgoingCall: vscode.CallHierarchyOutgoingCall =
                new vscode.CallHierarchyOutgoingCall(item, ranges);
            result.push(outgoingCall);
        }

        // for (var val of result) {
        //     this.call_out(val.to.uri.fsPath);
        //     this.call_out(String(val.to.range.start.line + 1));
        //     this.call_out("");
        // }

        return result;
    }

    private logTelemetry(eventName: string, requestStatus: CallHierarchyRequestStatus, progressBarDuration?: number): void {
        const properties: { [key: string]: string } = {};
        const metrics: { [key: string]: number } = {};

        let status: string = "Unknown";
        switch (requestStatus) {
            case CallHierarchyRequestStatus.Unknown: status = "Unknown"; break;
            case CallHierarchyRequestStatus.Succeeded: status = "Succeeded"; break;
            case CallHierarchyRequestStatus.Canceled: status = "Canceled"; break;
            case CallHierarchyRequestStatus.CanceledByUser: status = "CanceledByUser"; break;
            case CallHierarchyRequestStatus.Failed: status = "Failed"; break;
        }

        properties["Status"] = status;
        metrics["FirstRequest"] = this.isEntryRootNodeTelemetry ? 1 : 0;
        if (progressBarDuration) {
            metrics["ProgressBarDuration"] = progressBarDuration;
        }

        Telemetry.logLanguageServerEvent(eventName, properties, metrics);

        // Reset telemetry
        this.isEntryRootNodeTelemetry = false;
    }

    private dump(content:string): void {
        logger.write(content);
        logger.write("\n");
    }

    private call_in(content:string): void {
        call_in.write(content);
        call_in.write("\n");
    }

    // private call_out(content:string): void {
    //     call_out.write(content);
    //     call_out.write("\n");
    // }
}
