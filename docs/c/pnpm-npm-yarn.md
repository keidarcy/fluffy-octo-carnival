# npm/yarn的设计缺陷，以及pnpm是如何改进的

[[toc]]

## 什么是pnpm？

[pnpm](https://pnpm.io/) 根据官方网站的介绍，pnpm是performant npm的缩写。
> Fast, disk space efficient package manager

所以，pnpm和npm/yarn是属于同一类的贡酒。 目前（2021年12月），许多大型的开源项目（[vue](https://github.com/vuejs/vue-next), [prisma](https://github.com/prisma/prisma)...) 都迁移向了pnpm。 本文详细探讨了npm/yarn的设计缺陷，以及pnpm是如何改进的。

## 结论

npm/yarn - 缺点

- 扁平的node_modules结构允许访问没有引用的package。
- 来自不同项目的package不能共享，这是对磁盘空间的消耗。
- 安装缓慢，大量重复安装node_modules。

pnpm - 解决方案

- pnpm使用独创的基于symlink的node_modules结构，只允许访问package.json中的引入packages（严格）。
- 安装的package存储在一个任何文件夹都可以访问的目录里并用硬连接到各个node_modules，以节省磁盘空间（高效）。
- 有了上述改变，安装也会更快（快速）。

从官方网站上看，严格、高效、快速和对于monorepo的支持是pnpm的四大特点。但最新的npm8和yarn都支持workspaces,虽然支持的程度各有不同，但我并不认为这是npm/yarn的不足点。我们将在最后稍微讨论一下pnpm对于monorepo支持。

## 磁盘空间

### npm/yarn- 消耗磁盘空间的node_modules

npm/yarn有一个缺点，就是使用了太多的磁盘空间, 如果你安装同一个包100次，100分的就会被储存在不同的node_modules文件夹下。 举一个常有的的例子，如果完成了一个项目，而node_modules没有删掉保留了下来，往往会占用大量的磁盘空间。 为了解决这个问题，我经常使用[npkill](https://npkill.js.org/)。

```shell
$ npx npkill
```
可以扫描当前文件夹下的所有node_modules，并动态地删除它们。

### pnpm - 高效的使用磁盘空间

另一方面，pnpm将包存储在同一文件夹中（content-addressable store），只要当你在同一OS的同一个用户在下再次安装时就只需要创建一个硬链接。 MacOs的默认位置是~/.pnpm-store，甚至当安装同一package的不同版本时，只有不同的部分会被重新保存。 也就是说然后当你安装一个package时，如果它在store里，建立硬连接新使用，如果没有，就下载保存在store再创建硬连接。

使用硬链接做到的是

- 安装速度非常快([基准](https://pnpm.io/benchmarks)甚至比yarn的[pnp模式](https://classic.yarnpkg.com/en/docs/pnp/)更快！)
- 节省磁盘空间

下面是在一台安装过express的电脑上重新安装的结果。顺便把npm/yarn安装的输出结果贴出来。

pnpm

```
$ pnpm i express
Packages: +52
++++++++++++++++++++++++++++++++++++++++++++++++++++
Progress: resolved 52, reused 52, downloaded 0, added 0, done

dependencies:
+ express 4.17.1
```

npm

```
$ npm i express
npm WARN npm@1.0.0 No description
npm WARN npm@1.0.0 No repository field.

+ express@4.17.1
added 50 packages from 37 contributors and audited 50 packages in 4.309s
found 0 vulnerabilities
```

yarn

```
$ yarn add express
yarn add v1.22.11
[1/4] 🔍  Resolving packages...
[2/4] 🚚  Fetching packages...
[3/4] 🔗  Linking dependencies...
[4/4] 🔨  Building fresh packages...

success Saved lockfile.
success Saved 29 new dependencies.
info Direct dependencies
└─ express@4.17.1
info All dependencies
├─ accepts@1.3.7
├─ array-flatten@1.1.1
├─ body-parser@1.19.0
├─ content-disposition@0.5.3
├─ cookie-signature@1.0.6
├─ cookie@0.4.0
├─ destroy@1.0.4
├─ ee-first@1.1.1
├─ express@4.17.1
├─ finalhandler@1.1.2
├─ forwarded@0.2.0
├─ inherits@2.0.3
├─ ipaddr.js@1.9.1
├─ media-typer@0.3.0
├─ merge-descriptors@1.0.1
├─ methods@1.1.2
├─ mime-db@1.51.0
├─ mime@1.6.0
├─ ms@2.0.0
├─ negotiator@0.6.2
├─ path-to-regexp@0.1.7
├─ proxy-addr@2.0.7
├─ raw-body@2.4.0
├─ safer-buffer@2.1.2
├─ serve-static@1.14.1
├─ type-is@1.6.18
├─ unpipe@1.0.0
├─ utils-merge@1.0.1
└─ vary@1.1.2
✨  Done in 1.14s.
```

我甚至认为pnpm在输出易懂方面也略胜一筹，因为你可以立即看到你重用了多少包和重新下载了多少包而并不像yarn把所有关联的包都以列表的形式列出来，因为大概率我们并不在意这些。

## node_modules结构和依赖性解析

现在开始请考虑同样一个简单的例子：安装一个依赖于bar的foo包。

npm/yarn经历了三次重大的更新，才逐渐形成了现在的形式，所以让我们一个一个地看，一边了解pnpm的改进。

### npm1 - 嵌套式的node_modules

由于foo依赖于bar，最简单的思考方式是bar应该被放在foo的node_modules中。
npm1采用了同样的想法，所以它的结构是这样的。

```
.
└── node_modules
    └── foo
        ├── index.d.ts
        ├── package.json
        └── node_modules
            └── bar
                ├── index.js
                └── package.json
```

如果bar有其他依赖，例如lodash，那按我们的理论它将进入bar的node_modules，这就是所谓的嵌套node_modules。 那么这种结构有什么问题呢？

```
.
└── node_modules
    └── foo
        ├── index.js
        ├── package.json
        └── node_modules
            └── bar
                ├── index.js
                ├── package.json
                └── node_modules
                    └── lodash
                        ├── index.js
                        └── package.json
```

是的！这很容易形成近似无限的嵌套。 如果最终的路径太深，会有以下问题

- 路径太长，超过windows路径长度的限制。
- 大量的重复安装。如果foo和bar依赖于同一版本的loadsh，那么在安装时，独立的 node_modules会有完全相同的lodash。
- 不能共享相同的实例值。 例如，如果从不同的地方引用React，它将是一个不同的实例，所以应该共享的内部变量不能被共享。

### npm3/yarn - 扁平化的node_modules

从npm3开始（也包括yarn），扁平化的node_modules一直被采用并使用到现在。nodejs的[依赖解析](https://nodejs.org/api/modules.html#all-together)算法有一个规则，如果它在当前目录下没有找到node_modules，它将递归解析父目录下的node_modules，那么利用这一点把所有引用的包放在项目下node_modules中，就可以解决所有包的不共享和过长的依赖路径问题。

在上面的例子中，结构将会看起来像这样

```
.
└── node_modules
    ├── foo
    │   ├── index.js
    │   └── package.json
    └── bar
        ├── index.js
        └── package.json
```

这也是为什么单单是安装express，node_modules里会有50几个文件夹的原因，他们都被平铺到了node_modules下。

但是又有了新的问题。
1. package.json里并没有写入的包竟然也可以在项目中使用了([Phantom](https://rushjs.io/pages/advanced/phantom_deps/) - 幻影依赖)。
2. node_modules安装的不稳定性（[Doppelgangers](https://rushjs.io/pages/advanced/npm_doppelgangers/) - 分身依赖）。
3. 平铺式的node_modules算法复杂，耗费时间。

#### Phantom

如果你安装了依赖bar的foo，你就可以直接访问bar，因为它也在node_modules下。
如果它被不经意地用在一个项目中，而有一天foo停止使用bar，或者bar被升级到一个较新的版本，项目代码中引用的bar的状态可能会改变，并导致意外的错误。

#### Doppelgangers

Doppelgangers会比较复杂，从上面的例子里加入foo依赖于lodash@1.0.0，bar依赖于lodash@1.0.1

```
foo - lodash@1.0.0
bar - lodash@1.0.1
```

这样的话，根据nodejsの[依赖解析](https://nodejs.org/api/modules.html#all-together)ルールでは、require(PACKAGE_NAME)的PACKAGE_NAME必须是node_modules下同名的文件下，像这样加入版本号的名称PACKAGE_NAME＠VERSION是不行的。那这样的话，结构是

```
.
└── node_modules
    ├── foo
    │   ├── index.js
    │   └── package.json
    ├── bar
    │   ├── index.js
    │   ├── package.json
    │   └── node_modules
    │       └── lodash
    │           ├── index.js
    │           └── package.json(@1.0.1)
    └── lodash
        ├── index.js
        └── package.json(@1.0.0)
```

还是

```
.
└── node_modules
    ├── foo
    │   ├── index.js
    │   ├── package.json
    │   └── node_modules
    │       └── lodash
    │           ├── index.js
    │           └── package.json(@1.0.0)
    ├── bar
    │   ├── index.js
    │   └── package.json
    └── lodash
        ├── index.js
        └── package.json(@1.0.1)
```

这样呢？

然而结果是都有可能。

会根据foo和bar在package.json中的位置决定。foo在上面的话就是上面的结构否则的话就是下面的结构。
这样的不确定性叫做Doppelgangers。


### npm5.x/yarn - 带有lock文件的平铺式的node_modules

引入了一个lock文件，以解决node_modules安装中的不确定因素。 这使得无论你安装多少次，都能有一个一样结构的node_modules。 这也是为什么lock文件应该始终包含在版本控制中并且不应该手动编辑的原因。

然而，平铺式的算法的复杂性，以及Phantom、性能和安全问题仍未得到解决。


### pnpm - シンボリックリンクに基づくnode_modules構造

この部分は複雑で公式サイトでの[説明](https://pnpm.io/symlinked-node-modules-structure)は一番良い気がしますが、これに基づいて説明してみます。

node_modulesが生成するまでのステップ大きく2つあります。

#### ハードリンクのフォルダー構造

```
.
└── node_modules
    └── .pnpm
        ├── foo@1.0.0
        │   └── node_modules
        │       └── foo -> <store>/foo
        └── bar@1.0.0
            └── node_modules
                └── bar -> <store>/bar
```
一見他の構造と全く違って、最初のnode_modulesの配下は.pnpmというフォルダしかないです。.pnpmの配下は<パッケージ名＠バージョン>フォルダができて、その配下の<パッケージ名>フォルダはstoreのハードリンクです。これだけで動かないので、次のステップも大事です。

#### 依頼解析用のシンボリックリンク

- foo内にbarを引用するためのシンボリックリンク
- プロジェクトからfooを引用するためのシンボリックリンク


```
.
└── node_modules
    ├── foo -> ./.pnpm/foo@1.0.0/node_modules/foo
    └── .pnpm
        ├── foo@1.0.0
        │   └── node_modules
        │       ├── foo -> <store>/foo
        │       └── bar -> ../../bar@1.0.0/node_modules/bar
        └── bar@1.0.0
            └── node_modules
                └── bar -> <store>/bar
```

これで最もシンプルなpnpm node_modulesの構造になります。プロジェクトのコードはpackage.jsonにあるものしか引用できないことと、無駄なインストールが完全になしでできます。[peers dependencies](https://pnpm.io/how-peers-are-resolved)は少し複雑になりますが、peer以外は全部このような構造を持つことができます。

例えば、fooとbarは同時にlodashを依存としたら、以下のような構造になります。

```
.
└── node_modules
    ├── foo -> ./.pnpm/foo@1.0.0/node_modules/foo
    └── .pnpm
        ├── foo@1.0.0
        │   └── node_modules
        │       ├── foo -> <store>/foo
        │       ├── bar -> ../../bar@1.0.0/node_modules/bar
        │       └── lodash -> ../../lodash@1.0.0/node_modules/lodash
        ├── bar@1.0.0
        │   └── node_modules
        │       ├── bar -> <store>/bar
        │       └── lodash -> ../../lodash@1.0.0/node_modules/lodash
        └── lodash@1.0.0
            └── node_modules
                └── lodash -> <store>/lodash
```

これで、どのような複雑の依存性でもこの深さのパスで完結は可能となって、革新的なnode_modules構造です。


### pnpm以外の解決法

#### npm global-style
npmもflat node_modulesの問題点を解決するため、[global-style](https://docs.npmjs.com/cli/v8/using-npm/config#global-style)という設定でflat node_modulesを禁止することができますが、nested node_modules時代の問題に戻って、この解決法は広がっていないです。

#### dependency-check
npm/yarn自体で、解決しにくいので、[dependency-check](https://github.com/dependency-check-team/dependency-check)というツールを使ってチェックします。

```
$ dependency-check ./package.json --verbose
Success! All dependencies used in the code are listed in package.json
Success! All dependencies in package.json are used in the code
```
公式READMEの一部を見たら、やっていることは大体わかってくるでしょうか。

他の解決法と比べて、pnpmはやっぱり一番スッキリしますね！

## 最後に

### 基本のコマンド
上記の説明でpnpmは非常に複雑なイメージかもしれないですが、実は全く違います！
npm/yarnを使ったことがある人は、ほぼ勉強コストなしでpnpmが使えます。いくつ例のコマンドを見てみましょう。

```shell
pnpm install express
pnpm update express
pnpm remove express
```
ほぼ知っているコマンドと変わらないですね！

### モノリポサポート

pnpmはモノリポもサポートです。作者は[lernaとの比較の文章](https://medium.com/pnpm/pnpm-vs-lerna-filtering-in-a-multi-package-repository-1f68bc644d6a)もあります。詳細を説明すると、長くなるので、ここは一例だけ紹介させます。

```shell
pnpm --parallel  run --recursive  --filter @meetsmore test
```
やっていることは、非同期で@meetsmore配下のworkspaceでのnpm script testを実行するコマンドです。元々lernaとかモノリポ管理のライブラリー必要なシーンもpnpmだけ完結可能です。
