# npm/yarn の不足点と pnpm を推す理由

[[toc]]

## what's pnpm

[pnpm](https://pnpm.io/) 公式サイトによると、pnpmはperformant npmを表しています。

> Fast, disk space efficient package manager

なので、pnpmはnpm/yarn同じような存在です。現在（2021年12月）、たくさんメジャーのオープンソースプロジェクト（[vue](https://github.com/vuejs/vue-next)、[prisma](https://github.com/prisma/prisma)...）は pnpmを使用しています。本文はnpm/yarnの不足点、とpnpmはどっやって解決したのかついにて詳細を見てみます。

## quick conclusions

npm/yarn - 不足点

- フラットのanode_modules構造は、引用していない任意のパッケージにもアクセスできてしまう。
- 違うプロジェクトのパッケージが共有できなくて、ディスク容量消耗になる。
- インストールのスピードが遅い、node_modules重複のインストールがある。

pnpm - 解決法

- シンボリックリンクを用い独自のnode_modules構造を使用して、package.jsonにあるものしかアクセスできない（厳格）。
- インストールモジュールはグローバルストアからハードリンクされ、ディスク容量をセーブ（効率的）。
- 上記の対応で、インストールも早くなる（速い）。

厳格、効率的、速いとモノリポサポートも公式サイトから、pnpmの特徴と言われています。ただ、npm8とyarnもモノリポサポートなので、一応不足点と考えていないです。pnpmのモノリポをサポートは最後で少し話します。

## disk space efficient

###npm/yarn- heavy node_modules folders

npm/yarnはディスク容量使いすぎという不足点があって、同じプロジェクをト100回インストールしたら、100分のnode_modulesコピーがディスクに保存されます。日常の例では、前のプロジェクトが終わって、node_modulesがそのまま残って大量のディスク容量を使ってしまうことがよくあります。これを解決するため、[npkill](https://npkill.js.org/)がよく使われます。

```shell
$ npx npkill
```
で現在フォルダ配下で全てのnode_modulesをスキャンして、動的で削除できます。

### pnpm - disk space efficient

一方、pnpmはパッケージを全部同一フォルダ（content-addressable store）に保存して、同じパッケージの同じばジョンを再度インストールしたら、ハードリンクを作るだけです。MacOsデフォルトの場所は~/.pnpm-storeになります。しかも、同じパッケージの違うバージョンは差分だけが新たに保存されます。そうしたら、インストールする時に、storeにあったら、再利用、なければ、ダンロードしstoreに保存する形になります。

ハードリンクを使って、できたことは
- インストールが非常に高速([ベンチマーク](https://pnpm.io/benchmarks)でyarnの[pnpモード](https://classic.yarnpkg.com/en/docs/pnp/)より早い)
- ディスク容量節約

以下はexpress インストールしたことがあるパソコンで再インストールする時のアウトプットです。ついでに、npm/yarnインストール時のアウトプットも貼っておきます。

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

pnpmはどのぐらいパッケージ再利用か、新しくダンロードしたかすぐ分かるようになっているので、アウトプットのわかりやすさと言っても少し勝つかなと思いますね。


## node_modules structure and dependency resolution

これからは同じシンプルの例：barに依存するパッケージfooをインストールというシーンを考えてください。
npm/yarnは現在の形になるまで大きく3回の遷移があります。1つづつ見ていきましょう。

### npm1 - nested node_modules

fooはbarに依存するので、一番単純の考え方ではbarはfooのnode_modulesに入れればいいですね。
npm1も同じ考え方なので、このような構造になります。
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

もしbarは他の依頼例えばlodashがあれば、barのnode_modulesに入って、nested node_modulesと言います。では、このような問題点はなんでしょうか？

```
.
└── node_modules
    └── foo
        ├── index.js
        ├── package.json
        ├── node_modules
        └── bar
            ├── index.js
            ├── package.json
            └── node_modules
                └── lodash
                    ├── index.js
                    └── package.json
```

そうです。これは無限にnestedになりがちです。深すぎる構造になったら、以下の問題が発生します。
1. パスが長すぎて、windowsのpath長さの制限を超えてしまいます。
2. 重複のインストールが大量発生。仮にfooとbarが同じバージョンのloadshに依存性があったら、インストールしたら、別々のnode_modulesは全く同じlodashがあります。
3. 同じインスタンスのバリューを共有できないです。例えば、違う場所のReactを引用したら違うインスタンスになるので、共有すべき内部の変数は共有できないです。

### npm3/yarn - flat node_modules

npm3から（yarnも同じ) flat node_modulesを採用されて、今まで使われています。nodejsの[依存性解析](https://nodejs.org/api/modules.html#all-together)のアルゴリズムは現在のdirectoryにnode_modulesで見つからなければ、再帰的に親のdirectoryのnode_modulesに解析するルールがあって、これを利用して全てのパッケージをnode_modules直下において、共有できないものと依存pathが長すぎる問題を解決できました。

上記の例では以下のような構造になります。

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

これも、expressをインストールだけで、node_modulesに50ぐらいのパッケージができてしまう理由です。
ただ、新たな問題が出てきます。


1. `package.json`に書いていないパッケージでもアクセスできる([Phantom](https://rushjs.io/pages/advanced/phantom_deps/))。
2. node_modulesインストールの不確定性（[Doppelgangers](https://rushjs.io/pages/advanced/npm_doppelgangers/)）。
3. flat node_modulesアルゴリズム自体が複雑で、時間かかる。

#### Phantom

barに依存性があるfooをインストールしたら、barもnode_modulesの配下なので、直接アクセスできます。
仮に不注意でプロジェクトで使われたとしたら、いつかfooはbarを使わなくなるかbarのバージョンをアップグレードしたら、プロジェクトのコードで引用しているbarの状態がおかしくなります。

#### Doppelgangers

Doppelgangersは少し複雑になるので、例からfooはlodash@1.0.0依存、barはlodash@1.0.1
```
foo - lodash@1.0.0
bar - lodash@1.0.1
```
にしたら、nodejsの[依存性解析](https://nodejs.org/api/modules.html#all-together)ルールでは、require(PACKAGE_NAME)のPACKAGE_NAMEはnode_modules配下のフォルダーと同じ必要、というのはPACKAGE_NAME＠VERSIONはできない。そうしたら、構造は

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
と
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

どちらになるでしょうか？

結果はどちらも可能です・・・

package.jsonでの位置で決まります。fooが上なら、上の構造、じゃなければ下の構造。このような不確定性はDoppelgangersと言います。


### npm5.x/yarn - flat node_modules with lock file

node_modulesインストールの不確定性の解決ため、lockファイルが導入されました。そうすれば、何回をインストールしても、同じような構造になることが可能になるます。これもlockファイルをrepositoryに必ず入れて、手動で編集しない理由です。

ただし、flat アルゴリズムの複雑さ、とPhantomアクセス、性能と安全の問題は未解決です。


### pnpm - symlinked node_modules structure

この部分は複雑で公式サイトでの[説明](https://pnpm.io/symlinked-node-modules-structure)は一番良い気がしますが、これに基づいて説明してみます。

node_modulesが生成するまでのステップ大きく二つあります。
1. 実際にあるフォルダー構造のハードリンク

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
一見他の構造と全く違って、最初のnode_modulesの配下は.pnpmというフォルダしかないです。.pnpmの配下は<パッケージ名＠バージョン>フォルダができて、その配下の<パッケージ名>フォルダはstoreのハードリンクです。これだけ全く動かないので、次のステップも大事です。

2. 依頼解析用のシンボリックリンク

- foo内にbarを引用するためのリンク
- プロジェクトからfooを引用するためのリンク

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

```shell
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

このように、どのような複雑の依存性でもこの深さのpathで完結は可能です。


### other solutions

#### npm global-style
npmも解決するため、[global-style](https://docs.npmjs.com/cli/v8/using-npm/config#global-style)という設定でflatのnode_modulesを禁止することができますが、nested node_modules時代の問題に戻って、この解決法は広がっていないです。

#### dependency-check
npm/yarn自体では解決しにくいので、[dependency-check](https://github.com/dependency-check-team/dependency-check)というツールを使ってチェックします。

```
$ dependency-check ./package.json --verbose
Success! All dependencies used in the code are listed in package.json
Success! All dependencies in package.json are used in the code
```
公式READMEの一部を見たら、やっていることは大体わかってくるでしょうか。

他の解決法と比べて、pnpmはやっぱり一番スッキリしますね！

## additional

### basic command
上記の説明でpnpmは非常に複雑なイメージかもしれないですが、実は全く違います！
npm/yarnを使ったことがある人は、ほぼ勉強コストなし pnpm使えます。いくつ例のコマンドを見てみましょう。

```shell
pnpm install express
pnpm update express
pnpm remove express
```
ほぼ知っているコマンドと変わらないですね！

### monorepo support

pnpmはモノリポもサポートです。作者は[lernaとの比較の文章](https://medium.com/pnpm/pnpm-vs-lerna-filtering-in-a-multi-package-repository-1f68bc644d6a)もあります。詳細を説明すると、長くなるので、ここは一例だけ紹介させます。

```shell
pnpm --parallel  run --recursive  --filter @meetsmore test
```
やっていることは、非同期で@meetsmore配下のworkspaceのnpm script testを実行するコマンドです。元々lernaとかモノリポ管理のライブラリー必要なシーンもpnpmだけ完結可能です。

ミツモアではyarn1のworkspaceに基づきのモノリポペースの開発で、pnpmに移行することも考えれられます。ミツモアの開発部ではより良いDXのため、日々新たなツールや技術の検討しています。
