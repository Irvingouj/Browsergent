# Browsergent Session History

This context defines the user-visible meaning of navigating and continuing prior agent conversations.

## Language

**对话分支回退（conversation rewind）**：在同一会话中将活动对话切回历史节点并从该点继续形成新分支，保留旧分支；选中 user message 时回到其前一历史节点并将原文放回输入框，不自动重跑。它只改变对话历史，不撤销或重放既有浏览器/文件操作；继续前以当前实际页面状态为准。
_Avoid_: 操作撤销、世界状态回滚

**会话分支（session branch）**：同一会话中从某个历史节点延伸出的对话路径；切换活动分支不会删除其他路径。
