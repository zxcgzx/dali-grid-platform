# 结构化优化模型输出契约 v1.0

权威机器可读定义：\`schemas/model-output-v1.schema.json\`。

## 输出分区

| 分区 | JSON字段 | 内容 |
|---|---|---|
| 问题与模型信息 | request_summary / model_meta | 需求摘要、问题类型、系统、时域、L1—L4层级、基础模型版本 |
| 集合与参数 | sets_parameters | 集合、参数、单位、索引、数据来源、确认状态 |
| 数学模型表达 | mathematical_model | 总体数学表述、方程集合、建模说明 |
| 决策变量 | decision_variables | 符号、定义域、索引、单位、物理含义 |
| 目标函数 | objective | min/max、表达式、分项、建模依据 |
| 约束方程 | constraints | 约束编号、类别、表达式、作用范围、来源和状态 |
| 结构变更 | structural_changes | 新增/删除/修改的变量、目标、约束及理由 |
| 假设与缺失信息 | assumptions / missing_information | 显式假设、待用户补充信息；禁止自行补造 |
| 求解配置 | solver_specification | 求解器、容差和输出设置 |
| 代码实现 | code | 语言、框架、入口、源代码、依赖 |
| 校验状态 | validation | 语法、维度、物理和求解准备状态及发现的问题 |
| 来源追溯 | provenance | 测试题目、模型名称、生成时间 |

## 单项模型元素
\`sets_parameters\`、\`decision_variables\`、\`mathematical_model.equations\`、\`objective.terms\`、\`constraints\`、\`structural_changes\`中的模型元素统一使用：
- \`id\`：稳定编号；
- \`symbol\`：数学符号；
- \`name\`：名称；
- \`expression\`：数学表达或定义；
- \`unit\`：单位；
- \`scope\`：索引/适用范围；
- \`source\`：用户输入、基础模型、知识依据或推理依据；
- \`status\`：proposed / confirmed / pending / rejected。

## 必须遵守的生成规则
1. 只返回一个JSON对象，不在JSON前后混入Markdown说明。
2. 缺失参数写入\`missing_information\`，不能凭空生成数值。
3. L2/L4推断值必须记录变化方向、依据和待确认状态。
4. 未运行的语法、数学维度、物理或求解测试必须标记pending/not_run。
5. LLM自评不能替代独立校验器；不允许将模型自检标成物理校验通过。
6. 代码必须与数学模型、变量和约束编号保持可追溯关联。
