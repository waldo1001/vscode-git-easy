// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
var vscode = require('vscode');
// var projectRoot = vscode.workspace.rootPath;
var projectRoot = "/home/bibhas/Rivendell/vscode/git-easy/";
var simpleGit = require('simple-git')((projectRoot) ? projectRoot : '.');
var childProcess = require('child_process');
var fs = require('fs');

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
function activate(context) {
    var outputChannel = vscode.window.createOutputChannel("GitEasy");

    var disposableInit = vscode.commands.registerCommand('giteasy.doInit', function () {
        if (projectRoot === undefined) {
            vscode.window.showErrorMessage("No directory open. Please open a directory first.")
        } else {
            simpleGit.init(function () {
                vscode.window.showInformationMessage("Initiated git repository at " + projectRoot);
            });
        }
    });

    var disposableLogAll = vscode.commands.registerCommand('giteasy.doLogAll', function () {
        simpleGit.log({}, function (error, result) {
            if (error) {
                showOutput(error);
                return;
            }
            var logs = [];
            var last100 = result.all.slice(0, 100);
            last100.forEach(function(element) {
                if (!element.hasOwnProperty("hash")) {
                    return;
                }
                logs.push({
                    'label': element.message,
                    'description': timeSince(new Date(element.date)) + " by " + (element.author_name || element.author_email),
                    'detail': element.hash
                })
            }, this);
            vscode.window.showQuickPick(logs).then(function (result) {
                if (result == null) {
                    return;
                }
                simpleGit.show([result.detail, ], function (error, result) {
                    if (error) throw error;
                    showSidebarDiff(result);
                });
            })
        })
    });

    var disposableOriginCurrentPull = vscode.commands.registerCommand('giteasy.doOriginCurrentPull', function () {
        simpleGit.branch(function(error, branchSummary) {
            if (error) {
                showOutput(error);
                return;
            } else if (branchSummary.all.length == 0) {
                vscode.window.showErrorMessage("No branches found. Git add files and commit maybe?")
            } else {
                console.log(branchSummary);
                simpleGit.pull("origin", branchSummary.current, function(err, update) {
                    if(update && update.summary.changes) {
                        showOutput(update.summary.changes);
                    } else if (err) {
                        showOutput(err);
                    }
                });
            }
        })
    });

    var disposableOriginCurrentPush = vscode.commands.registerCommand('giteasy.doOriginCurrentPush', function () {
        simpleGit.branch(function(error, branchSummary) {
            if (error) {
                showOutput(error);
                return;
            }
            simpleGit.outputHandler(function (command, stdout, stderr) {
                stdout.on('data', function(buffer) {
                    outputChannel.clear();
                    appendOutput(buffer.toString('utf8'));
                });
                stderr.on('data', function(buffer) {
                    outputChannel.clear();
                    appendOutput(buffer.toString('utf8'));
                });
            }).push("origin", branchSummary.current, function () {});
            simpleGit.outputHandler(function (command, stdout, stderr) {
                // do nothinggg
            })
        })
    });

    var disposableAddOrigin = vscode.commands.registerCommand('giteasy.doAddOrigin', function () {
        vscode.window.showInputBox({
            'placeHolder': "Enter origin URL"
        }).then(function (message) {
            simpleGit.addRemote("origin", message, function(err, result) {
                if (err) {
                    showOutput(err);
                    return;
                }
            })
        });
    });

    var disposableChangeBranch = vscode.commands.registerCommand('giteasy.doChangeBranch', function () {
        simpleGit.branch(function(error, branchSummary) {
            if (error) {
                showOutput(error);
                return;
            }
            console.log(branchSummary);
            var branches = [];
            branchSummary.all.forEach(function(element) {
                if (!element.startsWith("remotes/")) {
                    if (element == branchSummary.current) {
                        branches.push("(current) " + element);
                    } else {
                        branches.push(element);
                    }
                }
            }, this);
            vscode.window.showQuickPick(branches).then(function(result) {
                if (result == null) {
                    return;
                }
                if (!result.startsWith("(current)")) {
                    simpleGit.checkout(result, function (error, result) {
                        if (error) {
                            showOutput(error);
                        } else {
                            console.log(result);
                        }
                    })
                }
            })
        });
    });

    var disposableCreateBranch = vscode.commands.registerCommand('giteasy.doCreateBranch', function () {
        vscode.window.showInputBox({
            'placeHolder': "Enter new branch name"
        }).then(function (branchName) {
            simpleGit.checkoutLocalBranch(branchName, function (error, result) {
                if (error) {
                    showOutput(error);
                } else {
                    console.log(result);
                }
            })
        });
    });

    var disposableCommit = vscode.commands.registerCommand('giteasy.doCommit', function () {
        vscode.window.showInputBox({
            'placeHolder': "Enter your commit message"
        }).then(function (message) {
            if (message === undefined) {
                return;
            } else if (message === "") {
                vscode.window.showInformationMessage("You must enter a commit message!");
            } else {
                simpleGit.commit(message, function (error, result) {
                    if (error) {
                        showOutput(error);
                        return;
                    } else {
                        console.log(result);
                        var msg = "Committed to branch " + result.branch + " (" + result.commit + ")\n" +
                                result.summary.changes + " change(s), " +
                                result.summary.insertions + " addition(s), " +
                                result.summary.deletions + " deletion(s).";
                        showOutput(msg);
                    }
                })
            }
        })
    });

    var disposableAdd = vscode.commands.registerCommand('giteasy.doAdd', function () {
        var fileList = [];
        simpleGit.status(function(error, status) {
            if (error) {
                showOutput(error);
                return;
            }
            fileList.push({
                'label': "Add All Modified",
                'description': "AddAllModified"
            })
            fileList.push({
                'label': "Add All Modified + Untracked",
                'description': "AddAllModifiedUntracked"
            })
            fileList = fillFileList(status, fileList, true)

            var qp = vscode.window.showQuickPick(fileList);
            qp.then(function (result) {
                if (result == null) {
                    return;
                }
                if (result.description == "AddAllModified") {
                    simpleGit.status(function(error, status) {
                        status.modified.forEach(function(element) {
                            simpleGit.add(element);
                        }, this);
                    });
                } else if (result.description == "AddAllModifiedUntracked") {
                    simpleGit.status(function(error, status) {
                        status.modified.forEach(function(element) {
                            simpleGit.add(element);
                        }, this);
                        status.not_added.forEach(function(element) {
                            simpleGit.add(element);
                        }, this);
                    });
                } else {
                    simpleGit.add(result.label, function (result) {
                        console.log(result);
                    })
                }
            })
        });
    });

    var disposableAddAll = vscode.commands.registerCommand('giteasy.doAddAll', function () {
        simpleGit.status(function(error, status) {
            if (error) {
                showOutput(error);
                return;
            }
            status.modified.forEach(function(element) {
                simpleGit.add(element);
            }, this);
        });
    });

    var disposableStatus = vscode.commands.registerCommand('giteasy.doStatus', function () {
        var fileList = [];
        simpleGit.status(function(error, status) {
            console.log(status);
            if (error) {
                showOutput(error);
                return;
            }
            fileList = fillFileList(status, fileList, false);

            var qp = vscode.window.showQuickPick(fileList);
            qp.then(function (result) {
                if (result == null) {
                    return;
                }
                if (["Untracked", "New"].indexOf(result.description) >= 0) {
                    return;
                } else {
                    simpleGit.diff([result.label, ], function (error, result) {
                        if (error) throw error;
                        fs.writeFile('/tmp/.git-easy.diff', result, (err) => {
                            if (err) throw err;
                            vscode.workspace.openTextDocument('/tmp/.git-easy.diff')
                                .then(function (file) {
                                    vscode.window.showTextDocument(file, vscode.ViewColumn.Two, false);
                                });
                        });
                    });
                }
            })
        });
    });

    context.subscriptions.push(disposableInit);
    context.subscriptions.push(disposableOriginCurrentPull);
    context.subscriptions.push(disposableOriginCurrentPush);
    context.subscriptions.push(disposableAdd);
    context.subscriptions.push(disposableAddAll);
    context.subscriptions.push(disposableStatus);
    context.subscriptions.push(disposableCommit);
    context.subscriptions.push(disposableAddOrigin);
    context.subscriptions.push(disposableChangeBranch);
    context.subscriptions.push(disposableCreateBranch);

    function fillFileList(status, fileList, is_gitadd=false) {
        console.log(status);
        status.modified.forEach(function(element) {
            var item = {
                'label': element,
                'description': "Modified"
            };
            fileList.push(item);
        }, this);
        status.not_added.forEach(function(element) {
            var item = {
                'label': element,
                'description': "Untracked"
            };
            fileList.push(item)
        }, this);

        if (!is_gitadd) {
            status.created.forEach(function(element) {
                var item = {
                    'label': element,
                    'description': "New"
                };
                fileList.push(item)
            }, this);
        }
        return fileList;
    }
    function showSidebarDiff(text) {
        fs.writeFile('/tmp/.git-easy.diff', text, (err) => {
            if (err) throw err;
            vscode.workspace.openTextDocument('/tmp/.git-easy.diff')
                .then(function (file) {
                    vscode.window.showTextDocument(file, vscode.ViewColumn.Two, false);
                });
        });
    }
    function showOutput(text) {
        outputChannel.clear();
        outputChannel.append(text);
        outputChannel.show(vscode.ViewColumn.Three);
    }
    function appendOutput(text) {
        outputChannel.show(vscode.ViewColumn.Three);
        outputChannel.appendLine(text);
    }
    function timeSince(date) {
        var seconds = Math.floor((new Date() - date) / 1000);
        var interval = Math.floor(seconds / 31536000);
        if (interval > 1) {
            return interval + " years";
        }
        interval = Math.floor(seconds / 2592000);
        if (interval > 1) {
            return interval + " months";
        }
        interval = Math.floor(seconds / 86400);
        if (interval > 1) {
            return interval + " days";
        }
        interval = Math.floor(seconds / 3600);
        if (interval > 1) {
            return interval + " hours";
        }
        interval = Math.floor(seconds / 60);
        if (interval > 1) {
            return interval + " minutes";
        }
        return Math.floor(seconds) + " seconds";
    }
}
exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() {
}
exports.deactivate = deactivate;