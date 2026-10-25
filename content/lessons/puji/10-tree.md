# 树与二叉树

## 基本概念

- 树：n 个点、n - 1 条边、任意两点之间只有一条路径。
- 根、父亲、儿子、叶子、深度。
- 二叉树：每个点最多两个儿子（左儿子、右儿子）。

## 存二叉树

```cpp
int lc[N], rc[N];   // 左右儿子，0 表示没有
```

## 求深度（P4913）

```cpp
int depth(int u) {
    if (u == 0) return 0;
    return max(depth(lc[u]), depth(rc[u])) + 1;
}
```

## 三种遍历

- 先序：根 → 左 → 右
- 中序：左 → 根 → 右
- 后序：左 → 右 → 根

```cpp
void preorder(int u) {
    if (!u) return;
    cout << u;
    preorder(lc[u]);
    preorder(rc[u]);
}
```

## 由中序和后序求先序（P1030）

后序的**最后一个**一定是根。在中序里找到根的位置，左边是左子树，右边是右子树，然后递归处理。

```cpp
void solve(string in, string post) {
    if (in.empty()) return;
    char root = post.back();
    int k = in.find(root);
    cout << root;
    solve(in.substr(0, k), post.substr(0, k));
    solve(in.substr(k + 1), post.substr(k, in.size() - k - 1));
}
```

## 常见错误

1. 递归没判断空节点。
2. 子串的起点、长度算错，可以拿样例手推一遍。

## 做题建议

按顺序做，三题都不长。做完可以想想：已知先序和后序，能不能唯一确定一棵二叉树？
