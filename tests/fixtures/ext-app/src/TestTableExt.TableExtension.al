tableextension 70000 "Test Item Ext" extends "Test Item"
{
    fields
    {
        field(70000; "Custom Category"; Text[50])
        {
            Caption = 'Custom Category';
            DataClassification = CustomerContent;
        }
        field(70001; "Priority"; Integer)
        {
            Caption = 'Priority';
            DataClassification = CustomerContent;
        }
        field(70002; "Extended Status"; Enum "Test Status")
        {
            Caption = 'Extended Status';
            DataClassification = CustomerContent;
        }
    }
}
