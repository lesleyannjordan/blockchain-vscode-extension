/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
*/
import * as vscode from 'vscode';
import * as os from 'os';
import * as chai from 'chai';
import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';
import { ExtensionUtil } from '../../extension/util/ExtensionUtil';
import * as fs from 'fs-extra';
import * as chaiAsPromised from 'chai-as-promised';
import { dependencies, version as currentExtensionVersion } from '../../package.json';
import { SettingConfigurations } from '../../configurations';
import { GlobalState } from '../../extension/util/GlobalState';
import { ExtensionCommands } from '../../ExtensionCommands';
import { TutorialGalleryView } from '../../extension/webview/TutorialGalleryView';
import { HomeView } from '../../extension/webview/HomeView';
import { SampleView } from '../../extension/webview/SampleView';
import { TutorialView } from '../../extension/webview/TutorialView';
import { Reporter } from '../../extension/util/Reporter';
import { PreReqView } from '../../extension/webview/PreReqView';
import { DependencyManager } from '../../extension/dependencies/DependencyManager';
import { VSCodeBlockchainOutputAdapter } from '../../extension/logging/VSCodeBlockchainOutputAdapter';
import { TemporaryCommandRegistry } from '../../extension/dependencies/TemporaryCommandRegistry';
import { LogType } from '../../extension/logging/OutputAdapter';
import { UserInputUtil } from '../../extension/commands/UserInputUtil';
import { FabricRuntime } from '../../extension/fabric/FabricRuntime';
import { FabricRuntimeManager } from '../../extension/fabric/FabricRuntimeManager';
import { FabricRuntimeUtil } from '../../extension/fabric/FabricRuntimeUtil';
import { FabricDebugConfigurationProvider } from '../../extension/debug/FabricDebugConfigurationProvider';
import { ReactView } from '../../extension/webview/ReactView';
import { FabricWalletRegistry } from '../../extension/registries/FabricWalletRegistry';
import { FabricWalletRegistryEntry } from '../../extension/registries/FabricWalletRegistryEntry';
import { TestUtil } from '../TestUtil';

const should: Chai.Should = chai.should();
chai.use(sinonChai);
chai.use(chaiAsPromised);
// tslint:disable no-unused-expression
describe('ExtensionUtil Tests', () => {

    let mySandBox: sinon.SinonSandbox;
    const workspaceFolder: any = {
        name: 'myFolder',
        uri: vscode.Uri.file('myPath')
    };

    before(async () => {
        mySandBox = sinon.createSandbox();
        await TestUtil.setupTests(mySandBox);
    });

    afterEach(() => {
        mySandBox.restore();
    });

    describe('getPackageJSON', () => {
        it('should get the packageJSON', async () => {
            await ExtensionUtil.activateExtension();
            const packageJSON: any = ExtensionUtil.getPackageJSON();
            packageJSON.name.should.equal('ibm-blockchain-platform');
        });
    });

    describe('activateExtension', () => {
        it('should activate the extension', async () => {
            await ExtensionUtil.activateExtension();

            const isActive: boolean = vscode.extensions.getExtension('IBMBlockchain.ibm-blockchain-platform').isActive;
            isActive.should.equal(true);
        });
    });

    describe('getExtensionPath', () => {
        // skipping as path doesn't contain blockchain-vscode-extension in azure devops pipeline
        xit('should get the extension path', () => {
            const path: string = ExtensionUtil.getExtensionPath();
            path.should.contain('blockchain-vscode-extension');
        });
    });

    describe('loadJSON', () => {
        it('should return parsed workspace package.json', async () => {

            mySandBox.stub(fs, 'readFile').resolves(`{
                "name": "mySmartContract",
                "version": "0.0.1"
            }`);

            const result: any = await ExtensionUtil.loadJSON(workspaceFolder, 'package.json');
            result.should.deep.equal({
                name: 'mySmartContract',
                version: '0.0.1'
            });
        });

        it('should handle errors', async () => {

            mySandBox.stub(fs, 'readFile').throws({ message: 'Cannot read file' });

            await ExtensionUtil.loadJSON(workspaceFolder, 'package.json').should.be.rejectedWith('error reading package.json from project Cannot read file');

        });
    });

    describe('getContractNameAndVersion', () => {
        it('should get contract name and version', async () => {

            mySandBox.stub(ExtensionUtil, 'loadJSON').resolves({ name: 'projectName', version: '0.0.3' });

            const result: any = await ExtensionUtil.getContractNameAndVersion(workspaceFolder);
            result.should.deep.equal({
                name: 'projectName',
                version: '0.0.3'
            });
        });

        it('should handle errors', async () => {

            mySandBox.stub(ExtensionUtil, 'loadJSON').throws({ message: 'error reading package.json from project Cannot read file' });
            should.equal(await ExtensionUtil.getContractNameAndVersion(workspaceFolder), undefined);
        });
    });

    describe('migrateSettingConfigurations', () => {
        let getConfigurationStub: sinon.SinonStub;
        let workspaceConfigurationGetStub: sinon.SinonStub;
        let workspaceConfigurationUpdateStub: sinon.SinonStub;

        beforeEach(() => {
            getConfigurationStub = mySandBox.stub(vscode.workspace, 'getConfiguration');
            workspaceConfigurationGetStub = mySandBox.stub();
            workspaceConfigurationUpdateStub = mySandBox.stub();
        });
        it('should ignore migration if old configuration values no longer exist', async () => {
            getConfigurationStub.returns({
                get: workspaceConfigurationGetStub,
                update: workspaceConfigurationUpdateStub
            });

            await ExtensionUtil.migrateSettingConfigurations();
            workspaceConfigurationGetStub.callCount.should.equal(4);
            workspaceConfigurationUpdateStub.should.not.have.been.called;
        });

        it('should migration old configuration values to new values', async () => {
            workspaceConfigurationGetStub.returns([]);
            getConfigurationStub.returns({
                get: workspaceConfigurationGetStub,
                update: workspaceConfigurationUpdateStub
            });

            workspaceConfigurationGetStub.onCall(0).returns([
                {
                    name: 'myGateway',
                    connectionProfilePath: 'blockchain/extension/directory/gatewayOne/connection.json',
                    associatedWallet: ''
                }
            ]);

            workspaceConfigurationGetStub.onCall(2).returns([
                {
                    managedWallet: false,
                    name: 'myWallet',
                    walletPath: '/some/path'
                }
            ]);

            workspaceConfigurationGetStub.onCall(4).returns([
                {
                    name: 'hyperledger/fabric-samples',
                    path: '/sample/path/fabric-samples'
                }
            ]);

            workspaceConfigurationGetStub.onCall(6).returns('some_directory');

            await ExtensionUtil.migrateSettingConfigurations();
            workspaceConfigurationGetStub.callCount.should.equal(7);
            workspaceConfigurationUpdateStub.callCount.should.equal(4);
            workspaceConfigurationUpdateStub.getCall(0).should.have.been.calledWithExactly(SettingConfigurations.FABRIC_GATEWAYS, [
                {
                    name: 'myGateway',
                    connectionProfilePath: 'blockchain/extension/directory/gatewayOne/connection.json',
                    associatedWallet: ''
                }
            ], vscode.ConfigurationTarget.Global);

            workspaceConfigurationUpdateStub.getCall(1).should.have.been.calledWithExactly(SettingConfigurations.OLD_FABRIC_WALLETS, [
                {
                    managedWallet: false,
                    name: 'myWallet',
                    walletPath: '/some/path'
                }
            ], vscode.ConfigurationTarget.Global);

            workspaceConfigurationUpdateStub.getCall(2).should.have.been.calledWithExactly(SettingConfigurations.EXTENSION_REPOSITORIES, [
                {
                    name: 'hyperledger/fabric-samples',
                    path: '/sample/path/fabric-samples'
                }
            ], vscode.ConfigurationTarget.Global);

            workspaceConfigurationUpdateStub.getCall(3).should.have.been.calledWithExactly(SettingConfigurations.EXTENSION_DIRECTORY, 'some_directory', vscode.ConfigurationTarget.Global);

        });

        it('should ignore migration if values already exist in new config', async () => {
            getConfigurationStub.returns({
                get: workspaceConfigurationGetStub,
                update: workspaceConfigurationUpdateStub
            });

            workspaceConfigurationGetStub.onCall(0).returns([
                {
                    name: 'myGateway',
                    connectionProfilePath: 'blockchain/extension/directory/gatewayOne/connection.json',
                    associatedWallet: ''
                }
            ]);

            workspaceConfigurationGetStub.onCall(1).returns([
                {
                    name: 'alreadyStoredGateway',
                    connectionProfilePath: 'blockchain/extension/directory/gatewayOne/connection.json',
                    associatedWallet: ''
                }
            ]);

            workspaceConfigurationGetStub.onCall(2).returns([
                {
                    managedWallet: false,
                    name: 'myWallet',
                    walletPath: '/some/path'
                }
            ]);

            workspaceConfigurationGetStub.onCall(3).returns([
                {
                    managedWallet: false,
                    name: 'alreadyStoredWallet',
                    walletPath: '/some/path'
                }
            ]);

            workspaceConfigurationGetStub.onCall(4).returns([
                {
                    name: 'hyperledger/fabric-samples',
                    path: '/sample/path/fabric-samples'
                }
            ]);

            workspaceConfigurationGetStub.onCall(5).returns([
                {
                    name: 'hyperledger/fabric-samples',
                    path: '/already/stored/fabric-samples'
                }
            ]);

            workspaceConfigurationGetStub.onCall(6).returns(undefined);

            await ExtensionUtil.migrateSettingConfigurations();
            workspaceConfigurationGetStub.callCount.should.equal(7);
            workspaceConfigurationUpdateStub.callCount.should.equal(0);

        });

    });

    describe('skipNpmInstall', () => {

        it('skipNpmInstall should return false', async () => {

            const result: boolean = await ExtensionUtil.skipNpmInstall();
            result.should.equal(false);

        });
    });

    describe('checkIfIBMer', () => {
        it('should return true if ibmer', () => {
            const _interface: any = {
                lo: [
                    {
                        address: '9.125.0.1',
                        family: 'IPv4',
                    }
                ]
            };

            mySandBox.stub(os, 'networkInterfaces').returns(_interface);
            const result: boolean = ExtensionUtil.checkIfIBMer();
            result.should.equal(true);
        });

        it('should return true if ibmer (multiple)', () => {
            const _interface: any = {
                lo: [
                    {
                        address: '9.125.0.1',
                        family: 'IPv4',
                    }
                ],
                eth0: [
                    {
                        address: '192.168.1.108',
                        netmask: '255.255.255.0',
                        family: 'IPv4'
                    },
                    {
                        address: '9.168.1.108',
                        netmask: '255.255.255.0',
                        family: 'IPv6'
                    },
                ]
            };

            mySandBox.stub(os, 'networkInterfaces').returns(_interface);
            const result: boolean = ExtensionUtil.checkIfIBMer();
            result.should.equal(true);
        });

        it('should return false if not ibmer', () => {
            const _interface: any = {
                lo: [
                    {
                        address: '10.125.0.1',
                        family: 'IPv6',
                    }
                ],
                eth0: [
                    {
                        address: '192.168.1.108',
                        netmask: '255.255.255.0',
                        family: 'IPv4'
                    },
                    {
                        address: '10.168.1.108',
                        netmask: '255.255.255.0',
                        family: 'IPv6'
                    },
                ]
            };
            mySandBox.stub(os, 'networkInterfaces').returns(_interface);
            const result: boolean = ExtensionUtil.checkIfIBMer();
            result.should.equal(false);
        });
    });

    describe('registerCommands', () => {

        before(async () => {
            if (!ExtensionUtil.isActive()) {
                await ExtensionUtil.activateExtension();
            }
        });

        it('should check all the commands are registered', async () => {
            const allCommands: Array<string> = await vscode.commands.getCommands();

            const commands: Array<string> = allCommands.filter((command: string) => {
                return command.startsWith('gatewaysExplorer') || command.startsWith('aPackagesExplorer') || command.startsWith('environmentExplorer') || command.startsWith('extensionHome') || command.startsWith('walletExplorer') || command.startsWith('preReq');
            });

            commands.should.deep.equal([
                'aPackagesExplorer.focus',
                'environmentExplorer.focus',
                'gatewaysExplorer.focus',
                'walletExplorer.focus',
                ExtensionCommands.REFRESH_GATEWAYS,
                ExtensionCommands.CONNECT_TO_GATEWAY,
                ExtensionCommands.DISCONNECT_GATEWAY,
                ExtensionCommands.ADD_GATEWAY,
                ExtensionCommands.DELETE_GATEWAY,
                ExtensionCommands.ADD_WALLET_IDENTITY,
                ExtensionCommands.CREATE_SMART_CONTRACT_PROJECT,
                ExtensionCommands.PACKAGE_SMART_CONTRACT,
                ExtensionCommands.REFRESH_PACKAGES,
                ExtensionCommands.REFRESH_ENVIRONMENTS,
                ExtensionCommands.START_FABRIC,
                ExtensionCommands.STOP_FABRIC,
                ExtensionCommands.RESTART_FABRIC,
                ExtensionCommands.TEARDOWN_FABRIC,
                ExtensionCommands.OPEN_NEW_TERMINAL,
                ExtensionCommands.EXPORT_CONNECTION_PROFILE,
                ExtensionCommands.EXPORT_CONNECTION_PROFILE_CONNECTED,
                ExtensionCommands.DELETE_SMART_CONTRACT,
                ExtensionCommands.EXPORT_SMART_CONTRACT,
                ExtensionCommands.IMPORT_SMART_CONTRACT,
                ExtensionCommands.ADD_ENVIRONMENT,
                ExtensionCommands.DELETE_ENVIRONMENT,
                ExtensionCommands.ASSOCIATE_IDENTITY_NODE,
                ExtensionCommands.IMPORT_NODES_TO_ENVIRONMENT,
                ExtensionCommands.REPLACE_ASSOCIATED_IDENTITY,
                ExtensionCommands.DELETE_NODE,
                ExtensionCommands.CONNECT_TO_ENVIRONMENT,
                ExtensionCommands.DISCONNECT_ENVIRONMENT,
                ExtensionCommands.INSTALL_SMART_CONTRACT,
                ExtensionCommands.INSTANTIATE_SMART_CONTRACT,
                ExtensionCommands.EDIT_GATEWAY,
                ExtensionCommands.TEST_ALL_SMART_CONTRACT,
                ExtensionCommands.TEST_SMART_CONTRACT,
                ExtensionCommands.SUBMIT_TRANSACTION,
                ExtensionCommands.EVALUATE_TRANSACTION,
                ExtensionCommands.UPGRADE_SMART_CONTRACT,
                ExtensionCommands.CREATE_NEW_IDENTITY,
                ExtensionCommands.REFRESH_WALLETS,
                ExtensionCommands.ADD_WALLET,
                ExtensionCommands.REMOVE_WALLET,
                ExtensionCommands.DELETE_IDENTITY,
                ExtensionCommands.ASSOCIATE_WALLET,
                ExtensionCommands.DISSOCIATE_WALLET,
                ExtensionCommands.EXPORT_WALLET,
                ExtensionCommands.OPEN_HOME_PAGE,
                ExtensionCommands.OPEN_PRE_REQ_PAGE
            ]);
        });

        it('should check the activation events are correct', async () => {
            const packageJSON: any = ExtensionUtil.getPackageJSON();
            const activationEvents: string[] = packageJSON.activationEvents;

            activationEvents.should.deep.equal([
                `onView:gatewayExplorer`,
                `onView:environmentExplorer`,
                `onView:aPackagesExplorer`,
                `onView:walletExplorer`,
                `onCommand:${ExtensionCommands.ADD_GATEWAY}`,
                `onCommand:${ExtensionCommands.DELETE_GATEWAY}`,
                `onCommand:${ExtensionCommands.CONNECT_TO_GATEWAY}`,
                `onCommand:${ExtensionCommands.DISCONNECT_GATEWAY}`,
                `onCommand:${ExtensionCommands.REFRESH_GATEWAYS}`,
                `onCommand:${ExtensionCommands.EDIT_GATEWAY}`,
                `onCommand:${ExtensionCommands.TEST_SMART_CONTRACT}`,
                `onCommand:${ExtensionCommands.TEST_ALL_SMART_CONTRACT}`,
                `onCommand:${ExtensionCommands.SUBMIT_TRANSACTION}`,
                `onCommand:${ExtensionCommands.EVALUATE_TRANSACTION}`,
                `onCommand:${ExtensionCommands.ASSOCIATE_WALLET}`,
                `onCommand:${ExtensionCommands.DISSOCIATE_WALLET}`,
                `onCommand:${ExtensionCommands.EXPORT_CONNECTION_PROFILE}`,
                `onCommand:${ExtensionCommands.EXPORT_CONNECTION_PROFILE_CONNECTED}`,
                `onCommand:${ExtensionCommands.CREATE_SMART_CONTRACT_PROJECT}`,
                `onCommand:${ExtensionCommands.PACKAGE_SMART_CONTRACT}`,
                `onCommand:${ExtensionCommands.DELETE_SMART_CONTRACT}`,
                `onCommand:${ExtensionCommands.EXPORT_SMART_CONTRACT}`,
                `onCommand:${ExtensionCommands.IMPORT_SMART_CONTRACT}`,
                `onCommand:${ExtensionCommands.REFRESH_PACKAGES}`,
                `onCommand:${ExtensionCommands.ADD_ENVIRONMENT}`,
                `onCommand:${ExtensionCommands.IMPORT_NODES_TO_ENVIRONMENT}`,
                `onCommand:${ExtensionCommands.DELETE_ENVIRONMENT}`,
                `onCommand:${ExtensionCommands.ASSOCIATE_IDENTITY_NODE}`,
                `onCommand:${ExtensionCommands.REPLACE_ASSOCIATED_IDENTITY}`,
                `onCommand:${ExtensionCommands.DELETE_NODE}`,
                `onCommand:${ExtensionCommands.CONNECT_TO_ENVIRONMENT}`,
                `onCommand:${ExtensionCommands.DISCONNECT_ENVIRONMENT}`,
                `onCommand:${ExtensionCommands.INSTALL_SMART_CONTRACT}`,
                `onCommand:${ExtensionCommands.INSTANTIATE_SMART_CONTRACT}`,
                `onCommand:${ExtensionCommands.REFRESH_ENVIRONMENTS}`,
                `onCommand:${ExtensionCommands.START_FABRIC}`,
                `onCommand:${ExtensionCommands.STOP_FABRIC}`,
                `onCommand:${ExtensionCommands.RESTART_FABRIC}`,
                `onCommand:${ExtensionCommands.TEARDOWN_FABRIC}`,
                `onCommand:${ExtensionCommands.OPEN_NEW_TERMINAL}`,
                `onCommand:${ExtensionCommands.UPGRADE_SMART_CONTRACT}`,
                `onCommand:${ExtensionCommands.CREATE_NEW_IDENTITY}`,
                `onCommand:${ExtensionCommands.REFRESH_WALLETS}`,
                `onCommand:${ExtensionCommands.ADD_WALLET}`,
                `onCommand:${ExtensionCommands.ADD_WALLET_IDENTITY}`,
                `onCommand:${ExtensionCommands.REMOVE_WALLET}`,
                `onCommand:${ExtensionCommands.DELETE_IDENTITY}`,
                `onCommand:${ExtensionCommands.EXPORT_WALLET}`,
                `onCommand:${ExtensionCommands.OPEN_HOME_PAGE}`,
                `onCommand:${ExtensionCommands.OPEN_PRE_REQ_PAGE}`,
                `onCommand:${ExtensionCommands.OPEN_TUTORIAL_GALLERY}`,
                `onCommand:${ExtensionCommands.OPEN_TRANSACTION_PAGE}`,
                `onDebug`
            ]);
        });

        it('should register commands', async () => {
            const disposeExtensionSpy: sinon.SinonSpy = mySandBox.spy(ExtensionUtil, 'disposeExtension');

            const ctx: vscode.ExtensionContext = GlobalState.getExtensionContext();
            const registerOpenPreReqsCommandStub: sinon.SinonStub = mySandBox.stub(ExtensionUtil, 'registerOpenPreReqsCommand').resolves(ctx);

            await ExtensionUtil.registerCommands(ctx);

            disposeExtensionSpy.should.have.been.calledOnceWith(ctx);
            registerOpenPreReqsCommandStub.should.have.been.calledOnce;
        });

        it('should register and show home page', async () => {
            const homeViewStub: sinon.SinonStub = mySandBox.stub(HomeView.prototype, 'openView');
            homeViewStub.resolves();

            const ctx: vscode.ExtensionContext = GlobalState.getExtensionContext();
            const registerOpenPreReqsCommandStub: sinon.SinonStub = mySandBox.stub(ExtensionUtil, 'registerOpenPreReqsCommand').resolves(ctx);

            await ExtensionUtil.registerCommands(ctx);

            await vscode.commands.executeCommand(ExtensionCommands.OPEN_HOME_PAGE);

            registerOpenPreReqsCommandStub.should.have.been.calledOnce;
            homeViewStub.should.have.been.calledOnce;
        });

        it('should register and show tutorial gallery', async () => {
            const tutorialGalleryViewStub: sinon.SinonStub = mySandBox.stub(TutorialGalleryView.prototype, 'openView');
            tutorialGalleryViewStub.resolves();

            const ctx: vscode.ExtensionContext = GlobalState.getExtensionContext();
            const registerOpenPreReqsCommandStub: sinon.SinonStub = mySandBox.stub(ExtensionUtil, 'registerOpenPreReqsCommand').resolves(ctx);

            await ExtensionUtil.registerCommands(ctx);

            await vscode.commands.executeCommand(ExtensionCommands.OPEN_TUTORIAL_GALLERY);

            registerOpenPreReqsCommandStub.should.have.been.calledOnce;
            tutorialGalleryViewStub.should.have.been.calledOnce;
        });

        it('should register and show React Page', async () => {
            const reactViewStub: sinon.SinonStub = mySandBox.stub(ReactView.prototype, 'openView');
            reactViewStub.resolves();

            const ctx: vscode.ExtensionContext = GlobalState.getExtensionContext();
            const registerOpenPreReqsCommandStub: sinon.SinonStub = mySandBox.stub(ExtensionUtil, 'registerOpenPreReqsCommand').resolves(ctx);

            await ExtensionUtil.registerCommands(ctx);

            await vscode.commands.executeCommand(ExtensionCommands.OPEN_TRANSACTION_PAGE);

            registerOpenPreReqsCommandStub.should.have.been.calledOnce;
            reactViewStub.should.have.been.calledOnce;
        });

        it('should register and show tutorial page', async () => {
            const tutorialViewStub: sinon.SinonStub = mySandBox.stub(TutorialView.prototype, 'openView');
            tutorialViewStub.resolves();

            const ctx: vscode.ExtensionContext = GlobalState.getExtensionContext();
            const registerOpenPreReqsCommandStub: sinon.SinonStub = mySandBox.stub(ExtensionUtil, 'registerOpenPreReqsCommand').resolves(ctx);

            await ExtensionUtil.registerCommands(ctx);

            await vscode.commands.executeCommand(ExtensionCommands.OPEN_TUTORIAL_PAGE, 'IBMCode/Code-Tutorials', 'Developing smart contracts with IBM Blockchain VSCode Extension');

            registerOpenPreReqsCommandStub.should.have.been.calledOnce;
            tutorialViewStub.should.have.been.calledOnce;
        });

        it('should register and show sample page', async () => {
            const sampleViewStub: sinon.SinonStub = mySandBox.stub(SampleView.prototype, 'openView');
            sampleViewStub.resolves();

            const ctx: vscode.ExtensionContext = GlobalState.getExtensionContext();
            const registerOpenPreReqsCommandStub: sinon.SinonStub = mySandBox.stub(ExtensionUtil, 'registerOpenPreReqsCommand').resolves(ctx);

            await ExtensionUtil.registerCommands(ctx);

            await vscode.commands.executeCommand(ExtensionCommands.OPEN_SAMPLE_PAGE, 'hyperledger/fabric-samples', 'FabCar');

            registerOpenPreReqsCommandStub.should.have.been.calledOnce;
            sampleViewStub.should.have.been.calledOnce;
        });

        it('should reload blockchain explorer when debug event emitted', async () => {
            await vscode.workspace.getConfiguration().update(SettingConfigurations.HOME_SHOW_ON_STARTUP, false, vscode.ConfigurationTarget.Global);

            const session: any = {
                some: 'thing',
                configuration: {
                    env: {},
                    debugEvent: FabricDebugConfigurationProvider.debugEvent
                }
            };
            mySandBox.stub(vscode.debug, 'onDidChangeActiveDebugSession').yields(session as vscode.DebugSession);
            const executeCommand: sinon.SinonSpy = mySandBox.spy(vscode.commands, 'executeCommand');
            const ctx: vscode.ExtensionContext = GlobalState.getExtensionContext();

            const registerOpenPreReqsCommandStub: sinon.SinonStub = mySandBox.stub(ExtensionUtil, 'registerOpenPreReqsCommand').resolves(ctx);

            await ExtensionUtil.registerCommands(ctx);

            registerOpenPreReqsCommandStub.should.have.been.calledOnce;

            executeCommand.should.have.been.calledOnce;
            executeCommand.should.have.been.calledOnceWith('setContext', 'blockchain-debug', true);
        });

        it('should call instantiate if not instantiated', async () => {
            await vscode.workspace.getConfiguration().update(SettingConfigurations.HOME_SHOW_ON_STARTUP, false, vscode.ConfigurationTarget.Global);
            mySandBox.stub(vscode.commands, 'registerCommand');
            const executeCommand: sinon.SinonStub = mySandBox.stub(vscode.commands, 'executeCommand');
            const ctx: vscode.ExtensionContext = GlobalState.getExtensionContext();

            const registerOpenPreReqsCommandStub: sinon.SinonStub = mySandBox.stub(ExtensionUtil, 'registerOpenPreReqsCommand').resolves(ctx);

            mySandBox.stub(FabricDebugConfigurationProvider, 'getInstantiatedChaincode').resolves();

            const session: any = {
                some: 'thing',
                configuration: {
                    env: {
                        CORE_CHAINCODE_ID_NAME: 'myContract:0.0.1'
                    },
                    debugEvent: FabricDebugConfigurationProvider.debugEvent
                }
            };

            const promises: any[] = [];
            const onDidChangeActiveDebugSessionStub: sinon.SinonStub = mySandBox.stub(vscode.debug, 'onDidChangeActiveDebugSession');

            promises.push(new Promise((resolve: any): void => {
                onDidChangeActiveDebugSessionStub.callsFake(async (callback: any) => {
                    await callback(session as vscode.DebugSession);
                    resolve();
                });

            }));

            await ExtensionUtil.registerCommands(ctx);
            await Promise.all(promises);

            registerOpenPreReqsCommandStub.should.have.been.calledOnce;
            executeCommand.should.have.been.calledThrice;
            executeCommand.should.have.been.calledWithExactly('setContext', 'blockchain-debug', true);
            executeCommand.should.have.been.calledWithExactly(ExtensionCommands.REFRESH_GATEWAYS);
            executeCommand.should.have.been.calledWith(ExtensionCommands.DEBUG_COMMAND_LIST, ExtensionCommands.INSTANTIATE_SMART_CONTRACT);
        });

        it('should call upgrade if version different', async () => {
            await vscode.workspace.getConfiguration().update(SettingConfigurations.HOME_SHOW_ON_STARTUP, false, vscode.ConfigurationTarget.Global);

            mySandBox.stub(FabricDebugConfigurationProvider, 'getInstantiatedChaincode').resolves({ name: 'myContract', version: 'differnet' });

            const session: any = {
                some: 'thing',
                configuration: {
                    env: {
                        CORE_CHAINCODE_ID_NAME: 'myContract:0.0.1'
                    },
                    debugEvent: FabricDebugConfigurationProvider.debugEvent
                }
            };

            const executeCommand: sinon.SinonStub = mySandBox.stub(vscode.commands, 'executeCommand');
            const ctx: vscode.ExtensionContext = GlobalState.getExtensionContext();

            const registerOpenPreReqsCommandStub: sinon.SinonStub = mySandBox.stub(ExtensionUtil, 'registerOpenPreReqsCommand').resolves(ctx);

            const promises: any[] = [];
            const onDidChangeActiveDebugSessionStub: sinon.SinonStub = mySandBox.stub(vscode.debug, 'onDidChangeActiveDebugSession');

            promises.push(new Promise((resolve: any): void => {
                onDidChangeActiveDebugSessionStub.callsFake(async (callback: any) => {
                    await callback(session as vscode.DebugSession);
                    resolve();
                });

            }));

            await ExtensionUtil.registerCommands(ctx);
            await Promise.all(promises);

            registerOpenPreReqsCommandStub.should.have.been.calledOnce;

            executeCommand.should.have.been.calledThrice;
            executeCommand.should.have.been.calledWithExactly('setContext', 'blockchain-debug', true);
            executeCommand.should.have.been.calledWithExactly(ExtensionCommands.REFRESH_GATEWAYS);
            executeCommand.should.have.been.calledWith(ExtensionCommands.DEBUG_COMMAND_LIST, ExtensionCommands.UPGRADE_SMART_CONTRACT);
        });

        it('should not call anything if version same', async () => {
            await vscode.workspace.getConfiguration().update(SettingConfigurations.HOME_SHOW_ON_STARTUP, false, vscode.ConfigurationTarget.Global);

            mySandBox.stub(FabricDebugConfigurationProvider, 'getInstantiatedChaincode').resolves({ name: 'myContract', version: '0.0.1' });

            const session: any = {
                some: 'thing',
                configuration: {
                    env: {
                        CORE_CHAINCODE_ID_NAME: 'myContract:0.0.1'
                    },
                    debugEvent: FabricDebugConfigurationProvider.debugEvent
                }
            };
            mySandBox.stub(vscode.debug, 'onDidChangeActiveDebugSession').yields(session as vscode.DebugSession);
            const executeCommand: sinon.SinonStub = mySandBox.stub(vscode.commands, 'executeCommand');

            const ctx: vscode.ExtensionContext = GlobalState.getExtensionContext();
            const registerOpenPreReqsCommandStub: sinon.SinonStub = mySandBox.stub(ExtensionUtil, 'registerOpenPreReqsCommand').resolves(ctx);

            await ExtensionUtil.registerCommands(ctx);

            registerOpenPreReqsCommandStub.should.have.been.calledOnce;

            executeCommand.should.have.been.calledTwice;
            executeCommand.should.have.been.calledWithExactly('setContext', 'blockchain-debug', true);
            executeCommand.should.have.been.calledWithExactly(ExtensionCommands.REFRESH_GATEWAYS);
            executeCommand.should.not.have.been.calledWith(ExtensionCommands.DEBUG_COMMAND_LIST);
        });

        it('should set blockchain-debug false when no debug session', async () => {
            await vscode.workspace.getConfiguration().update(SettingConfigurations.HOME_SHOW_ON_STARTUP, false, vscode.ConfigurationTarget.Global);

            const session: any = undefined;
            mySandBox.stub(vscode.debug, 'onDidChangeActiveDebugSession').yields(session as vscode.DebugSession);
            const executeCommand: sinon.SinonSpy = mySandBox.spy(vscode.commands, 'executeCommand');
            const ctx: vscode.ExtensionContext = GlobalState.getExtensionContext();

            const registerOpenPreReqsCommandStub: sinon.SinonStub = mySandBox.stub(ExtensionUtil, 'registerOpenPreReqsCommand').resolves(ctx);

            await ExtensionUtil.registerCommands(ctx);

            registerOpenPreReqsCommandStub.should.have.been.calledOnce;

            executeCommand.should.have.been.calledOnceWith('setContext', 'blockchain-debug', false);
        });

        it('should set blockchain-debug to false when starting a debug event other than for smart contrcts', async () => {
            await vscode.workspace.getConfiguration().update(SettingConfigurations.HOME_SHOW_ON_STARTUP, false, vscode.ConfigurationTarget.Global);
            const session: any = {
                some: 'thing'
            };
            mySandBox.stub(vscode.debug, 'onDidChangeActiveDebugSession').yields(session as vscode.DebugSession);
            const executeCommand: sinon.SinonSpy = mySandBox.spy(vscode.commands, 'executeCommand');
            const ctx: vscode.ExtensionContext = GlobalState.getExtensionContext();

            const registerOpenPreReqsCommandStub: sinon.SinonStub = mySandBox.stub(ExtensionUtil, 'registerOpenPreReqsCommand').resolves(ctx);

            await ExtensionUtil.registerCommands(ctx);

            registerOpenPreReqsCommandStub.should.have.been.calledOnce;

            executeCommand.should.have.been.calledOnceWith('setContext', 'blockchain-debug', false);
        });

        it('should set blockchain-debug to false when debugEvent property is missing', async () => {
            await vscode.workspace.getConfiguration().update(SettingConfigurations.HOME_SHOW_ON_STARTUP, false, vscode.ConfigurationTarget.Global);
            const session: any = {
                some: 'thing',
                configuration: {
                    something: 'else'
                }
            };
            mySandBox.stub(vscode.debug, 'onDidChangeActiveDebugSession').yields(session as vscode.DebugSession);
            const executeCommand: sinon.SinonSpy = mySandBox.spy(vscode.commands, 'executeCommand');
            const ctx: vscode.ExtensionContext = GlobalState.getExtensionContext();

            const registerOpenPreReqsCommandStub: sinon.SinonStub = mySandBox.stub(ExtensionUtil, 'registerOpenPreReqsCommand').resolves(ctx);

            await ExtensionUtil.registerCommands(ctx);

            registerOpenPreReqsCommandStub.should.have.been.calledOnce;

            executeCommand.should.have.been.calledOnceWith('setContext', 'blockchain-debug', false);
        });

        it('should push the reporter instance if production flag is true', async () => {
            mySandBox.stub(vscode.commands, 'executeCommand').resolves();

            mySandBox.stub(ExtensionUtil, 'getPackageJSON').returns({ production: true });
            const reporterStub: sinon.SinonStub = mySandBox.stub(Reporter, 'instance');

            const ctx: vscode.ExtensionContext = GlobalState.getExtensionContext();

            const registerOpenPreReqsCommandStub: sinon.SinonStub = mySandBox.stub(ExtensionUtil, 'registerOpenPreReqsCommand').resolves(ctx);

            await ExtensionUtil.registerCommands(ctx);

            registerOpenPreReqsCommandStub.should.have.been.calledOnce;

            reporterStub.should.have.been.called;
        });

        it(`shouldn't push the reporter instance if production flag is false`, async () => {
            mySandBox.stub(vscode.commands, 'executeCommand').resolves();

            mySandBox.stub(ExtensionUtil, 'getPackageJSON').returns({ production: false });
            const reporterStub: sinon.SinonStub = mySandBox.stub(Reporter, 'instance');

            const ctx: vscode.ExtensionContext = GlobalState.getExtensionContext();

            const registerOpenPreReqsCommandStub: sinon.SinonStub = mySandBox.stub(ExtensionUtil, 'registerOpenPreReqsCommand').resolves(ctx);

            await ExtensionUtil.registerCommands(ctx);

            registerOpenPreReqsCommandStub.should.have.been.calledOnce;

            reporterStub.should.not.have.been.called;
        });

        it('should refresh wallets if they update', async () => {
            const executeCommandSpy: sinon.SinonSpy = mySandBox.spy(vscode.commands, 'executeCommand');

            const walletRegistryEntry: FabricWalletRegistryEntry = new FabricWalletRegistryEntry();
            walletRegistryEntry.name = 'bobsWallet';
            walletRegistryEntry.walletPath = 'myPath';

            await FabricWalletRegistry.instance().add(walletRegistryEntry);

            executeCommandSpy.should.have.been.calledWith(ExtensionCommands.REFRESH_WALLETS);
        });
    });

    describe('registerOpenPreReqsCommand', () => {

        it('should register and open PreReq page', async () => {
            const preReqViewStub: sinon.SinonStub = mySandBox.stub(PreReqView.prototype, 'openView');
            preReqViewStub.resolves();

            const ctx: vscode.ExtensionContext = { subscriptions: [] } as vscode.ExtensionContext;
            const registerCommandStub: sinon.SinonStub = mySandBox.stub(vscode.commands, 'registerCommand').withArgs(ExtensionCommands.OPEN_PRE_REQ_PAGE).yields({} as vscode.Command);

            const context: vscode.ExtensionContext = await ExtensionUtil.registerOpenPreReqsCommand(ctx);
            context.subscriptions.length.should.equal(1);
            registerCommandStub.should.have.been.calledOnce;
            preReqViewStub.should.have.been.calledOnce;

        });
    });

    describe('setupCommands', () => {
        let hasNativeDependenciesInstalledStub: sinon.SinonStub;
        let installNativeDependenciesStub: sinon.SinonStub;
        let getPackageJsonStub: sinon.SinonStub;
        let rewritePackageJsonStub: sinon.SinonStub;
        let globalStateStub: sinon.SinonStub;
        let setupLocalRuntimeStub: sinon.SinonStub;
        let restoreCommandsStub: sinon.SinonStub;
        let getExtensionContextStub: sinon.SinonStub;
        let registerCommandsStub: sinon.SinonStub;
        let executeStoredCommandsStub: sinon.SinonStub;
        let logSpy: sinon.SinonSpy;

        beforeEach(() => {
            hasNativeDependenciesInstalledStub = mySandBox.stub(DependencyManager.instance(), 'hasNativeDependenciesInstalled');
            installNativeDependenciesStub = mySandBox.stub(DependencyManager.instance(), 'installNativeDependencies');
            getPackageJsonStub = mySandBox.stub(ExtensionUtil, 'getPackageJSON');
            rewritePackageJsonStub = mySandBox.stub(DependencyManager.instance(), 'rewritePackageJson');
            globalStateStub = mySandBox.stub(GlobalState, 'get');
            setupLocalRuntimeStub = mySandBox.stub(ExtensionUtil, 'setupLocalRuntime');
            restoreCommandsStub = mySandBox.stub(TemporaryCommandRegistry.instance(), 'restoreCommands');
            getExtensionContextStub = mySandBox.stub(GlobalState, 'getExtensionContext');
            registerCommandsStub = mySandBox.stub(ExtensionUtil, 'registerCommands');
            executeStoredCommandsStub = mySandBox.stub(TemporaryCommandRegistry.instance(), 'executeStoredCommands');
            logSpy = mySandBox.spy(VSCodeBlockchainOutputAdapter.instance(), 'log');
        });

        it('should install native dependencies if not installed', async () => {
            hasNativeDependenciesInstalledStub.returns(false);
            installNativeDependenciesStub.resolves();
            getPackageJsonStub.returns({ activationEvents: ['*'] });
            rewritePackageJsonStub.resolves();
            globalStateStub.returns({
                version: '1.0.0'
            });
            setupLocalRuntimeStub.resolves();
            restoreCommandsStub.resolves();
            getExtensionContextStub.returns({ hello: 'world' });
            registerCommandsStub.resolves();
            executeStoredCommandsStub.resolves();

            await ExtensionUtil.setupCommands();

            hasNativeDependenciesInstalledStub.should.have.been.calledOnce;
            installNativeDependenciesStub.should.have.been.calledOnce;
            globalStateStub.should.have.been.calledOnce;
            setupLocalRuntimeStub.should.have.been.calledOnceWithExactly('1.0.0');

            logSpy.should.have.been.calledThrice;
            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, 'Restoring command registry');
            logSpy.getCall(1).should.have.been.calledWith(LogType.INFO, undefined, 'Registering commands');
            logSpy.getCall(2).should.have.been.calledWith(LogType.INFO, undefined, 'Execute stored commands in the registry');

            restoreCommandsStub.should.have.been.calledOnce;
            getExtensionContextStub.should.have.been.calledOnce;
            registerCommandsStub.should.have.been.calledOnceWithExactly({ hello: 'world' });
            executeStoredCommandsStub.should.have.been.calledOnce;
        });

        it(`shouldn't install native dependencies if they are already installed`, async () => {
            hasNativeDependenciesInstalledStub.returns(true);
            installNativeDependenciesStub.resolves();
            getPackageJsonStub.returns({ activationEvents: ['activationEvent1', 'activationEvent2'] });
            rewritePackageJsonStub.resolves();
            globalStateStub.returns({
                version: '1.0.0'
            });
            setupLocalRuntimeStub.resolves();
            restoreCommandsStub.resolves();
            getExtensionContextStub.returns({ hello: 'world' });
            registerCommandsStub.resolves();
            executeStoredCommandsStub.resolves();

            await ExtensionUtil.setupCommands();

            hasNativeDependenciesInstalledStub.should.have.been.calledOnce;
            installNativeDependenciesStub.should.not.have.been.called;
            globalStateStub.should.have.been.calledOnce;
            setupLocalRuntimeStub.should.have.been.calledOnceWithExactly('1.0.0');

            logSpy.should.have.been.calledThrice;
            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, 'Restoring command registry');
            logSpy.getCall(1).should.have.been.calledWith(LogType.INFO, undefined, 'Registering commands');
            logSpy.getCall(2).should.have.been.calledWith(LogType.INFO, undefined, 'Execute stored commands in the registry');

            restoreCommandsStub.should.have.been.calledOnce;
            getExtensionContextStub.should.have.been.calledOnce;
            registerCommandsStub.should.have.been.calledOnceWithExactly({ hello: 'world' });
            executeStoredCommandsStub.should.have.been.calledOnce;
        });

        it(`should rewrite the package.json file if ther native dependencies are installed but there are no activation events`, async () => {
            hasNativeDependenciesInstalledStub.returns(true);
            installNativeDependenciesStub.resolves();
            getPackageJsonStub.returns({ activationEvents: ['*'] });
            rewritePackageJsonStub.resolves();
            globalStateStub.returns({
                version: '1.0.0'
            });
            setupLocalRuntimeStub.resolves();
            restoreCommandsStub.resolves();
            getExtensionContextStub.returns({ hello: 'world' });
            registerCommandsStub.resolves();
            executeStoredCommandsStub.resolves();

            await ExtensionUtil.setupCommands();

            hasNativeDependenciesInstalledStub.should.have.been.calledOnce;
            installNativeDependenciesStub.should.not.have.been.called;
            globalStateStub.should.have.been.calledOnce;
            setupLocalRuntimeStub.should.have.been.calledOnceWithExactly('1.0.0');

            logSpy.should.have.been.calledThrice;
            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, 'Restoring command registry');
            logSpy.getCall(1).should.have.been.calledWith(LogType.INFO, undefined, 'Registering commands');
            logSpy.getCall(2).should.have.been.calledWith(LogType.INFO, undefined, 'Execute stored commands in the registry');

            restoreCommandsStub.should.have.been.calledOnce;
            getExtensionContextStub.should.have.been.calledOnce;
            registerCommandsStub.should.have.been.calledOnceWithExactly({ hello: 'world' });
            executeStoredCommandsStub.should.have.been.calledOnce;
        });
    });

    describe('completeActivation', () => {
        let logSpy: sinon.SinonSpy;
        let globalStateGetStub: sinon.SinonStub;
        let executeCommandStub: sinon.SinonStub;
        let showConfirmationWarningMessageStub: sinon.SinonStub;
        let mockRuntime: sinon.SinonStubbedInstance<FabricRuntime>;
        let getRuntimeStub: sinon.SinonStub;
        let globalStateUpdateStub: sinon.SinonStub;

        beforeEach(() => {
            logSpy = mySandBox.spy(VSCodeBlockchainOutputAdapter.instance(), 'log');
            globalStateGetStub = mySandBox.stub(GlobalState, 'get');
            executeCommandStub = mySandBox.stub(vscode.commands, 'executeCommand');

            showConfirmationWarningMessageStub = mySandBox.stub(UserInputUtil, 'showConfirmationWarningMessage');
            mockRuntime = mySandBox.createStubInstance(FabricRuntime);

            // mockRuntime.isRunning.resolves(true);
            // mockRuntime.isGenerated.resolves(true)
            getRuntimeStub = mySandBox.stub(FabricRuntimeManager.instance(), 'getRuntime').returns(mockRuntime);
            globalStateUpdateStub = mySandBox.stub(GlobalState, 'update');
        });

        it(`shouldn't open home page if disabled in user settings`, async () => {
            await vscode.workspace.getConfiguration().update(SettingConfigurations.HOME_SHOW_ON_STARTUP, false, vscode.ConfigurationTarget.Global);

            globalStateGetStub.returns({
                generatorVersion: dependencies['generator-fabric']
            });

            executeCommandStub.resolves();

            await ExtensionUtil.completeActivation(false);

            logSpy.should.have.been.calledWith(LogType.INFO, null, 'IBM Blockchain Platform Extension activated');
            executeCommandStub.should.not.have.been.calledWith(ExtensionCommands.OPEN_HOME_PAGE);
            getRuntimeStub.should.not.have.been.called;
            globalStateUpdateStub.should.not.have.been.called;
        });

        it(`should open home page if enabled in user settings and extension has updated`, async () => {
            await vscode.workspace.getConfiguration().update(SettingConfigurations.HOME_SHOW_ON_STARTUP, true, vscode.ConfigurationTarget.Global);

            globalStateGetStub.returns({
                generatorVersion: dependencies['generator-fabric']
            });

            executeCommandStub.resolves();

            await ExtensionUtil.completeActivation(true);

            logSpy.should.have.been.calledWith(LogType.INFO, 'IBM Blockchain Platform Extension activated');
            executeCommandStub.should.have.been.calledWith(ExtensionCommands.OPEN_HOME_PAGE);
            getRuntimeStub.should.not.have.been.called;
            globalStateUpdateStub.should.not.have.been.called;
        });

        it(`should open home page on first activation`, async () => {
            await vscode.workspace.getConfiguration().update(SettingConfigurations.HOME_SHOW_ON_STARTUP, true, vscode.ConfigurationTarget.Global);

            globalStateGetStub.returns({
                version: '5.0.0',
                generatorVersion: dependencies['generator-fabric']
            });

            executeCommandStub.resolves();

            await ExtensionUtil.completeActivation();

            logSpy.should.have.been.calledWith(LogType.INFO, 'IBM Blockchain Platform Extension activated');
            executeCommandStub.should.have.been.calledWith(ExtensionCommands.OPEN_HOME_PAGE);
            getRuntimeStub.should.not.have.been.called;
            globalStateUpdateStub.should.not.have.been.called;
        });

        it(`shouldn't open home page on second activation`, async () => {
            await vscode.workspace.getConfiguration().update(SettingConfigurations.HOME_SHOW_ON_STARTUP, true, vscode.ConfigurationTarget.Global);

            globalStateGetStub.returns({
                version: currentExtensionVersion,
                generatorVersion: dependencies['generator-fabric']
            });

            executeCommandStub.resolves();

            await ExtensionUtil.completeActivation();

            logSpy.should.have.been.calledWith(LogType.INFO, null, 'IBM Blockchain Platform Extension activated');
            executeCommandStub.should.not.have.been.calledWith(ExtensionCommands.OPEN_HOME_PAGE);
            getRuntimeStub.should.not.have.been.called;
            globalStateUpdateStub.should.not.have.been.called;
        });

        it(`should update generator version to latest when the ${FabricRuntimeUtil.LOCAL_FABRIC_DISPLAY_NAME} has not been generated`, async () => {
            await vscode.workspace.getConfiguration().update(SettingConfigurations.HOME_SHOW_ON_STARTUP, true, vscode.ConfigurationTarget.Global);

            globalStateGetStub.returns({
                generatorVersion: '0.0.1'
            });

            executeCommandStub.resolves();
            mockRuntime.isGenerated.resolves(false);

            await ExtensionUtil.completeActivation(false);

            logSpy.should.have.been.calledWith(LogType.INFO, null, 'IBM Blockchain Platform Extension activated');
            executeCommandStub.should.not.have.been.calledWith(ExtensionCommands.OPEN_HOME_PAGE);
            getRuntimeStub.should.have.been.calledOnce;
            mockRuntime.isGenerated.should.have.been.calledOnce;
            showConfirmationWarningMessageStub.should.not.have.been.called;
            globalStateUpdateStub.should.have.been.calledWith({
                generatorVersion: dependencies['generator-fabric']
            });
        });

        // This test updates the generator to the lastest when the user is prompted by the showConfirmationWarningMessage.
        // It also doesn't start the newly generated Fabric, as it was stopped when the user selected 'Yes' at the prompt
        it(`should update generator version to latest when the user selects 'Yes' (and stopped)`, async () => {
            await vscode.workspace.getConfiguration().update(SettingConfigurations.HOME_SHOW_ON_STARTUP, true, vscode.ConfigurationTarget.Global);

            globalStateGetStub.returns({
                generatorVersion: '0.0.1'
            });

            executeCommandStub.resolves();
            mockRuntime.isGenerated.resolves(true);
            showConfirmationWarningMessageStub.resolves(true);
            mockRuntime.isRunning.resolves(false);

            await ExtensionUtil.completeActivation(false);

            logSpy.should.have.been.calledWith(LogType.INFO, null, 'IBM Blockchain Platform Extension activated');
            executeCommandStub.should.not.have.been.calledWith(ExtensionCommands.OPEN_HOME_PAGE);
            getRuntimeStub.should.have.been.calledOnce;
            mockRuntime.isGenerated.should.have.been.calledOnce;
            showConfirmationWarningMessageStub.should.have.been.calledOnce;
            mockRuntime.isRunning.should.have.been.calledOnce;
            executeCommandStub.should.have.been.calledWith(ExtensionCommands.TEARDOWN_FABRIC, undefined, true);
            executeCommandStub.should.not.have.been.calledWith(ExtensionCommands.START_FABRIC);
            globalStateUpdateStub.should.have.been.calledWith({
                generatorVersion: dependencies['generator-fabric']
            });
        });

        // This test updates the generator to the lastest when the user is prompted by the showConfirmationWarningMessage.
        // It should also start the newly generated Fabric, as it was stopped when the user selected 'Yes' at the prompt
        it(`should update generator version to latest when the user selects 'Yes' (and started)`, async () => {
            await vscode.workspace.getConfiguration().update(SettingConfigurations.HOME_SHOW_ON_STARTUP, true, vscode.ConfigurationTarget.Global);

            globalStateGetStub.returns({
                generatorVersion: '0.0.1'
            });

            executeCommandStub.resolves();
            mockRuntime.isGenerated.resolves(true);
            showConfirmationWarningMessageStub.resolves(true);
            mockRuntime.isRunning.resolves(true);

            await ExtensionUtil.completeActivation(false);

            logSpy.should.have.been.calledWith(LogType.INFO, null, 'IBM Blockchain Platform Extension activated');
            executeCommandStub.should.not.have.been.calledWith(ExtensionCommands.OPEN_HOME_PAGE);

            getRuntimeStub.should.have.been.calledOnce;
            mockRuntime.isGenerated.should.have.been.calledOnce;
            showConfirmationWarningMessageStub.should.have.been.calledOnce;
            mockRuntime.isRunning.should.have.been.calledOnce;
            executeCommandStub.should.have.been.calledWith(ExtensionCommands.TEARDOWN_FABRIC, undefined, true);
            executeCommandStub.should.have.been.calledWith(ExtensionCommands.START_FABRIC);
            globalStateUpdateStub.should.have.been.calledWith({
                generatorVersion: dependencies['generator-fabric']
            });
        });

        it(`shouldn't update the generator version to latest when the user selects 'No'`, async () => {
            await vscode.workspace.getConfiguration().update(SettingConfigurations.HOME_SHOW_ON_STARTUP, true, vscode.ConfigurationTarget.Global);

            globalStateGetStub.returns({
                generatorVersion: '0.0.1'
            });

            executeCommandStub.resolves();
            mockRuntime.isGenerated.resolves(true);
            showConfirmationWarningMessageStub.resolves(false);

            await ExtensionUtil.completeActivation(false);

            logSpy.should.have.been.calledWith(LogType.INFO, null, 'IBM Blockchain Platform Extension activated');
            executeCommandStub.should.not.have.been.calledWith(ExtensionCommands.OPEN_HOME_PAGE);
            getRuntimeStub.should.have.been.calledOnce;
            mockRuntime.isGenerated.should.have.been.calledOnce;
            showConfirmationWarningMessageStub.should.have.been.calledOnce;
            mockRuntime.isRunning.should.not.have.been.called;
            executeCommandStub.should.not.have.been.calledWith(ExtensionCommands.TEARDOWN_FABRIC, undefined, true);
            executeCommandStub.should.not.have.been.calledWith(ExtensionCommands.START_FABRIC);
            globalStateUpdateStub.should.not.have.been.calledWith({
                generatorVersion: dependencies['generator-fabric']
            });
        });

    });

    describe('setupLocalRuntime', () => {
        it(`should migrate runtime and initialize the runtime manager`, async () => {
            const logSpy: sinon.SinonSpy = mySandBox.spy(VSCodeBlockchainOutputAdapter.instance(), 'log');
            const migrateStub: sinon.SinonStub = mySandBox.stub(FabricRuntimeManager.instance(), 'migrate').resolves();
            const initializeStub: sinon.SinonStub = mySandBox.stub(FabricRuntimeManager.instance(), 'initialize').resolves();

            await ExtensionUtil.setupLocalRuntime('1.2.3');

            logSpy.should.have.been.calledTwice;
            logSpy.should.have.been.calledWith(LogType.INFO, undefined, 'Migrating local runtime manager');
            migrateStub.should.have.been.calledOnce;
            logSpy.should.have.been.calledWith(LogType.INFO, undefined, 'Initializing local runtime manager');
            initializeStub.should.have.been.calledOnce;
        });
    });
});
