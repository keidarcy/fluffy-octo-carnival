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


### pnpm - 基于符号链接的node_modules结构

这一部分略微复杂，我觉得最好的解释方式是在官方网站上的[説明](https://pnpm.io/symlinked-node-modules-structure)，所以在这边基于这篇文章加上自己的理解是这说明一下。

生成node_modules主要分为两个步骤。

#### 基于硬连接的node_modules

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
乍一看，结构与npm/yarn的结构完全不同，第一手node_modules下面的唯一文件夹叫做.pnpm。在.pnpm下面是一个<PACKAGE_NAME＠VERSION>文件夹，而在其下面<PACKAGE_NAME>的文件夹是一个content-addressable store的硬链接。 当然仅仅是这样还无法使用，所以下一步软链接也很关键。

#### 用于依赖解析的软链接

- 用于在foo内引用bar的软链接
- 在项目里引用foo的软链接

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

当然这只是使用pnpm的node_modules结构最简单的例子！但可以发现项目中能使用的代码只能是package.json中定义过的，并且完全可以做到没用无用的安装。[peers dependencies](https://pnpm.io/how-peers-are-resolved)的话会比这个稍微复杂一些，但一旦不考虑peer的话任何复杂的依赖都可以完全符合这种结构。

例如，当foo和bar同时依赖于lodash的时候，就会像下图这样的结构。

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

这样的话，不管是如何复杂的依赖关系都可以用这样的文件夹结构来构成，非常有创新性的结构！


### pnpm以外の解決法

#### npm global-style

npm也曾经为了解决扁平式node_modules的问题提供过，通过指定[global-style](https://docs.npmjs.com/cli/v8/using-npm/config#global-style)来禁止平铺node_modules，但这无疑又退回了嵌套式的node_modules时代的问题，所以并没有推广开来。

#### dependency-check
光靠npm/yarn的话看似无法解决，所以基础社区的解决方案[dependency-check](https://github.com/dependency-check-team/dependency-check)也经常被用到。

```
$ dependency-check ./package.json --verbose
Success! All dependencies used in the code are listed in package.json
Success! All dependencies in package.json are used in the code
```
有了本文的基础，光是看到README内一段命令行的输出应该也能想象到dependency-check是如何工作的了吧！

果然和其他的解决方案比，pnpm显得最为优雅吧。

## 额外补充

### 基本的命令

通过上文的描述，pnpm给人非常复杂的感觉，但实际用起来反而相反，非常非常的简单！
对于使用过npm/yarn的开发者来说、几乎不需要任何的学习成本。不信的话可以看看下面的例子

```shell
pnpm install express
pnpm update express
pnpm remove express
```

几乎和熟悉的命令没有区别，对吧！

### monorepo的支持

pnpm是对于对于monorepo支持的。pnpm的作者甚至写过[与lerna关于多个包命令的命令行比较](https://medium.com/pnpm/pnpm-vs-lerna-filtering-in-a-multi-package-repository-1f68bc644d6a)。如果详细说明的话，那就是另一篇文章了。下面之举一个简单的例子。

```shell
pnpm --parallel  run --recursive  --filter @xyh test
```
执行这段命令的话，就会异步执行@xyh字段下workspace的npm script test，之前需要额外安装lerna这种monorepo管理工具的场景也只需要pnpm就能做到了。
