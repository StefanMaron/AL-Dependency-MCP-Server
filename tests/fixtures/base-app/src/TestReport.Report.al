report 70000 "Test Item List"
{
    Caption = 'Test Item List';
    DefaultLayout = RDLC;

    dataset
    {
        dataitem(TestItem; "Test Item")
        {
            column(No; "No.")
            {
            }
            column(Description; Description)
            {
            }
            column(UnitPrice; "Unit Price")
            {
            }
        }
    }
}
