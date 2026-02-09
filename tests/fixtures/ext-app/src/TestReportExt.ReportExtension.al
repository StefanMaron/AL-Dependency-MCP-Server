reportextension 70000 "Test Item List Ext" extends "Test Item List"
{
    dataset
    {
        add(TestItem)
        {
            column(CustomCategory; "Custom Category")
            {
            }
            column(Priority; Priority)
            {
            }
        }
    }
}
